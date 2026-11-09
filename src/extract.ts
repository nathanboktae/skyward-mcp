// These functions run in Chrome. Keep them self-contained and return only public-facing
// fields, never DOM HTML, session URLs, security hashes, or credential values.
export function extractStudents() {
  return Array.from(document.querySelectorAll('#familyAccessHeaderSelect .familyAccessHeaderSelectTile[data-studentid]'))
    .filter(e => /^\d+$/.test(e.getAttribute('data-studentid') || ''))
    .map(e => ({studentId:e.getAttribute('data-studentid')!, name:Array.from(e.querySelectorAll('.familyAccessStudentNameText')).map(n=>n.textContent?.trim()).join(' '), school:e.getAttribute('data-entity-name'), schoolYear:e.getAttribute('data-entity-year')}));
}
export function extractGrades() {
  const clean = (e: Element | null) => {
    if (!e) return '';
    const copy = e.cloneNode(true) as Element;
    copy.querySelectorAll('.ariadescription,.sr-only').forEach(n=>n.remove());
    return copy.textContent?.replace(/\s+/g,' ').trim() || '';
  };
  return Array.from(document.querySelectorAll('.browse[id^="StudentGrades-"]')).map(browse=>{
    const headers = Array.from(browse.querySelectorAll('.unlockedHeaderTableRow')).find(r=>r.querySelector('.headerTextDiv'));
    const columns = headers ? Array.from(headers.querySelectorAll('.headerTextDiv')).map(clean) : [];
    const rows = Array.from(browse.querySelectorAll('tr.browseRow[id*="_unlockedRow"]')).map(row=>{
      const cells = Array.from(row.children).filter(e=>e.classList.contains('browseDataCell'));
      const link = cells[0]?.querySelector('[data-studentsectionid]');
      return {classId:link?.getAttribute('data-studentsectionid') || '', courseCode:link?.getAttribute('data-coursecode') || '', name:link?.getAttribute('data-coursedescription') || '', periodAndTerm:clean(cells[0]?.querySelector('.fivetoppadding') || null), missingAssignments:clean(cells[1] || null) || null,
        grades:columns.slice(2).map((term,i)=>({term,grade:clean(cells[i+2] || null)||null,current:headers?.children[i+2]?.classList.contains('progressReportDetailsOpenHeader') || false}))};
    });
    return {columns,rows};
  });
}
export function extractSchedule() {
  return Array.from(document.querySelectorAll('#scheduleMatrix .dataMatrixCell[data-studentsectionid]')).map(e=>{
    const lines = e.querySelectorAll(':scope > .matrixCellDiv');
    const text = (el:Element|null|undefined) => el?.textContent?.trim() || null;
    const period = e.closest('.primaryMatrixCell');
    return {classId:e.getAttribute('data-studentsectionid')!, name:e.getAttribute('data-coursedescription')!, courseCode:e.getAttribute('data-coursecode'),section:e.getAttribute('data-sectioncode'),
      teacher:text(lines[1]?.querySelector('.matrixCellLeft')),room:text(lines[1]?.querySelector('.matrixCellCenter')),term:text(lines[1]?.querySelector('.matrixCellRight')),
      startDate:e.getAttribute('data-startdate'),endDate:e.getAttribute('data-enddate'),date:e.getAttribute('data-calendarday')?.split(' ')[0] || null,
      period:text(period?.querySelector('.displayPeriodCodeDiv')),displayPeriodId:e.getAttribute('data-displayperiodid')!};
  });
}

// Grade breakdowns contain category totals alongside assignments. Only rows with
// assignment IDs are records; never turn totals or blank scores into assignments/zeros.
export function extractAssignments() {
  const root = document.querySelector('#GradeBucketAssignmentsSegmentedOuterContainer');
  if (!root) return null;
  const clean = (element: Element | null | undefined) => {
    if (!element) return null;
    const copy = element.cloneNode(true) as Element;
    copy.querySelectorAll('.ariadescription,.sr-only').forEach(e => e.remove());
    return copy.textContent?.replace(/\s+/g, ' ').trim() || null;
  };
  const number = (text: string | null | undefined) => {
    const value = text?.replace(/,/g, '').trim();
    return value && /^-?\d+(?:\.\d+)?$/.test(value) ? Number(value) : null;
  };
  const header = root.querySelector('.unlockedHeaderTableRow');
  const columns = Array.from(header?.querySelectorAll('.headerTextDiv') || []).map(e => clean(e) || '');
  const assignments = [];
  let category: string | null = null;
  for (const row of root.querySelectorAll('tr[id*="_unlockedRow"]')) {
    const cells = Array.from(row.children).filter(e => e.classList.contains('browseDataCell'));
    const field = (name: string) => clean(cells[columns.indexOf(name)]);
    if (row.className.includes('segmentedBrowseParentRow')) { category = field('Description'); continue; }
    const link = row.querySelector('[data-assignment-id]');
    if (!link) continue;
    const pointsText = field('Points Earned');
    const points = pointsText?.split('/');
    const scoreText = field('Score');
    assignments.push({
      assignmentId: link.getAttribute('data-assignment-id')!,
      name: field('Description'), category, dueDate: field('Due Date'),
      grade: field('Grade'), scoreText, pointsText,
      pointsEarned: points?.length === 2 ? number(points[0]) : null,
      pointsPossible: points?.length === 2 ? number(points[1]) : null,
      percentage: scoreText?.endsWith('%') ? number(scoreText.slice(0, -1)) : null,
      attempts: number(field('Attempts')),
    });
  }
  const reference = root.querySelector('.SegmentedAssignmentsReferenceInformation');
  const termCell = reference?.querySelectorAll('.SegmentedAssignmentsInformationCell')[1];
  return {columns, term: clean(termCell?.querySelector('.visualLabel')), assignments};
}
