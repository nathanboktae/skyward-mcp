import { chromium, type Browser, type Page } from 'playwright';
import { BrowserStateStore } from './browser-state.js';
import type { Config } from './config.js';
import { extractStudents, extractGrades, extractSchedule } from './extract.js';
import { isoDate, resolveTerm, SerialQueue, SkywardError } from './domain.js';

export class SkywardClient {
  private browser?: Browser;
  private queue = new SerialQueue();
  private state: BrowserStateStore;
  constructor(private config: Config) { this.state = new BrowserStateStore(config); }
  async close() { await this.browser?.close(); this.browser=undefined; }
  // Each operation restores browser identity and any valid authentication.
  // Serializing also avoids concurrent logins invalidating one another on Skyward.
  private run<T>(operation:(page:Page)=>Promise<T>):Promise<T> {
    return this.queue.run(async()=>{
      this.browser ??= await chromium.launch({channel:this.config.browser === 'chrome' ? 'chrome' : undefined,headless:true});
      const context = await this.browser.newContext({timezoneId:this.config.timezone, storageState:await this.state.load()});
      const page = await context.newPage();
      page.setDefaultTimeout(this.config.timeout);
      page.setDefaultNavigationTimeout(this.config.timeout);
      try {
        await page.goto(this.config.baseUrl,{waitUntil:'domcontentloaded'});
        await page.locator('#UserName, #familyAccessHeaderSelect').first().waitFor();
        if (!await page.locator('#familyAccessHeaderSelect').isVisible()) {
          // Never send credentials through an unexpected redirect or form destination.
          const origin=new URL(this.config.baseUrl).origin;
          const action=await page.locator('#Password').evaluate(e=>(e as HTMLInputElement).form?.action);
          if (new URL(page.url()).origin!==origin || !action || new URL(action).origin!==origin) throw new SkywardError('Unexpected login destination; credentials were not submitted.');
          await page.locator('#UserName').fill(this.config.username);
          await page.locator('#Password').fill(this.config.password);
          await page.getByRole('button',{name:'Sign In',exact:true}).click();
          try { await page.locator('#familyAccessHeaderSelect').waitFor(); }
          catch { throw new SkywardError('Skyward login did not reach Family Access. Check credentials, account lockout, or an interactive authentication requirement.'); }
        }
        await this.settle(page);
        await this.state.save(context);
        return await operation(page);
      } catch(error) {
        if (error instanceof SkywardError) throw error;
        // Playwright errors can include filled values, HTML, and session URLs.
        throw new SkywardError('Skyward did not finish loading the expected view. Retry the query; if it persists, the adapter needs inspection.', {cause:error});
      } finally {
        try { await this.state.save(context); } finally { await context.close(); }
      }
    });
  }
  private async settle(page:Page) { await page.waitForLoadState('networkidle'); }
  private async change(page:Page, action:()=>Promise<unknown>) {
    // Filter actions replace the page or matrix asynchronously. Wait for a response
    // triggered by the action before waiting for network idle.
    const response=page.waitForResponse(r=>new URL(r.url()).origin===new URL(this.config.baseUrl).origin && (['xhr','fetch'].includes(r.request().resourceType()) || r.request().isNavigationRequest()));
    await Promise.all([response, action()]); await this.settle(page);
  }
  private async open(page:Page, studentId:string, widget:string, path:string) {
    const students=await page.evaluate(extractStudents);
    const student=students.find(s=>s.studentId===studentId);
    if (!student) throw new SkywardError('Unknown studentId. Call list_students first.');
    // Root login normally opens all students; handle remembered single-student view.
    const all=page.locator('#familyAccessHeaderSelect .familyAccessHeaderSelectTile[data-studentid=""]');
    if (!await page.locator(`[id="${studentId}-${widget}_Widget"]`).isVisible()) {
      await this.change(page,()=>all.click());
    }
    const link=page.locator(`[id="${studentId}-${widget}_Widget"]`);
    await link.click();
    await page.waitForURL(u=>u.pathname.endsWith(path));
    await this.settle(page);
    const selected=page.locator('#familyAccessHeaderSelect .selected');
    if (await selected.getAttribute('data-studentid')!==studentId) throw new SkywardError('Skyward selected an unexpected student.');
    return student;
  }
  listStudents() { return this.run(async page=>({students:await page.evaluate(extractStudents),fetchedAt:new Date().toISOString()})); }
  getGrades(studentId:string, query: {quarter?:number;semester?:number;term?:string;classId?:string}={}) {
    return this.run(async page=>{
      const student=await this.open(page,studentId,'studentGrades','/Grading/StudentSection/FamilyAccess');
      const filter=page.getByRole('link',{name:'All Year',exact:true});
      // Always select All Year, so prior and future semester columns are present.
      if (await filter.getAttribute('aria-current')!=='true') await this.change(page,()=>filter.click());
      const tables=await page.evaluate(extractGrades);
      if (!tables.length || tables.some(t=>!t.columns.includes('Class'))) throw new SkywardError('Grade table structure was not recognized.');
      const availableTerms=[...new Set(tables.flatMap(t=>t.columns.slice(2)))];
      const term=resolveTerm(availableTerms,query);
      let classes=tables.flatMap(t=>t.rows);
      if (query.classId) classes=classes.filter(c=>c.classId===query.classId);
      if (query.classId && !classes.length) throw new SkywardError('No grade row matches this classId.');
      return {student,availableTerms,selectedTerm:term || null,classes:classes.map(c=>({...c,grades:c.grades.filter(g=>!term||g.term===term)})),fetchedAt:new Date().toISOString()};
    });
  }
  getSchedule(studentId:string) {
    return this.run(async page=>{
      const student=await this.open(page,studentId,'studentSchedule','/Scheduling/StudentScheduleDisplay/FamilyAccess');
      const view=page.locator('#cbScheduleDateRangeMode');
      if (await view.inputValue()!=='WeeklySchedule') await this.change(page,()=>view.selectOption('WeeklySchedule'));
      // Skyward persists month/week filters server-side, even across fresh logins.
      const today=new Intl.DateTimeFormat('en-CA',{timeZone:this.config.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      const month=page.getByRole('combobox',{name:'Month:',exact:true});
      const monthName=new Intl.DateTimeFormat('en-US',{timeZone:this.config.timezone,month:'long'}).format(new Date());
      const selectedMonth=await month.locator('option:checked').textContent();
      if (selectedMonth?.trim()!==monthName) await this.change(page,()=>month.selectOption({label:monthName}));
      const week=page.getByRole('combobox',{name:'Week:',exact:true});
      const options=await week.locator('option').evaluateAll(es=>es.map(e=>({value:(e as HTMLOptionElement).value,label:e.textContent||''})));
      const current=options.find(o=>{
        const start=isoDate(o.label.split(' - ')[0]);
        if (!start) return false;
        const delta=(Date.parse(today)-Date.parse(start))/86400000;
        return delta>=0 && delta<7;
      });
      if (!current) throw new SkywardError('Skyward has no weekly schedule for the current week.');
      if (await week.inputValue()!==current.value) await this.change(page,()=>week.selectOption(current.value));
      await page.locator('#scheduleMatrix').waitFor();
      const cards=await page.evaluate(extractSchedule);
      if (!cards.length) throw new SkywardError('No class cards found in the weekly schedule. The selected week may have no classes.');
      if (cards.some(c=>!c.date)) throw new SkywardError('Weekly schedule did not finish loading.');
      const classes=new Map<string, {classId:string;name:string;courseCode:string|null;section:string|null;teacher:string|null;term:string|null;startDate:string|null;endDate:string|null;meetings:Array<{date:string|null;period:string|null;room:string|null;time:string|null}>}>();
      for (const card of cards) {
        let course=classes.get(card.classId);
        if (!course) { course={classId:card.classId,name:card.name,courseCode:card.courseCode,section:card.section,teacher:card.teacher,term:card.term,startDate:isoDate(card.startDate),endDate:isoDate(card.endDate),meetings:[]}; classes.set(card.classId,course); }
        const date=isoDate(card.date);
        if (course.meetings.some(m=>m.date===date && m.period===card.period)) continue;
        const cell=page.locator(`.dataMatrixCell[data-studentsectionid="${card.classId}"][data-displayperiodid="${card.displayPeriodId}"]`).filter({visible:true});
        // IDs repeat across weekdays, so additionally match the dated card.
        const dated=cell.locator(`xpath=self::*[starts-with(@data-calendarday, '${card.date} ')]`).first();
        await dated.click();
        const dialog=page.getByRole('dialog');
        await dialog.waitFor();
        const timeField=dialog.getByRole('textbox',{name:'Time',exact:true});
        const time=await timeField.count() ? await timeField.inputValue() : null;
        course.meetings.push({date,period:card.period,room:card.room,time:time?.trim()||null});
        await dialog.getByRole('button',{name:'Close',exact:true}).click();
        await dialog.waitFor({state:'hidden'});
      }
      return {student,week:current.label,timezone:this.config.timezone,classes:[...classes.values()],fetchedAt:new Date().toISOString()};
    });
  }
}
