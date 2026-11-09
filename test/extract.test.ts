import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {extractStudents,extractGrades,extractSchedule} from '../dist/extract.js';
test('DOM extraction handles duplicate cell IDs, hidden accessibility text, blanks, and dated class identity',async()=>{
 const browser=await chromium.launch({channel:process.env.SKYWARD_BROWSER === 'chromium' ? undefined : 'chrome',headless:true});
 try {
 const page=await browser.newPage();
 await page.setContent(`<div id="familyAccessHeaderSelect"><div class="familyAccessHeaderSelectTile" data-studentid=""></div><div class="familyAccessHeaderSelectTile" data-studentid="12" data-entity-name="Example School" data-entity-year="2026-2027"><span class="familyAccessStudentNameText">STUDENT,</span><span class="familyAccessStudentNameText">EXAMPLE</span></div></div>
 <div class="browse" id="StudentGrades-99"><table><tr class="unlockedHeaderTableRow"><td><div class="headerTextDiv">Class</div></td><td><div class="headerTextDiv">Missing Assignments</div></td><td><div class="headerTextDiv">T1</div></td><td class="progressReportDetailsOpenHeader"><div class="headerTextDiv">S1</div></td></tr><tr class="browseRow" id="StudentGrades-99_unlockedRow0"><td class="browseDataCell"><a data-studentsectionid="123" data-coursecode="MATH1" data-coursedescription="Geometry"><div class="fivetoppadding">Period 3 - SEMESTER 1</div></a></td><td class="browseDataCell"></td><td class="browseDataCell" id="same"><span>C-</span><span class="ariadescription">Opens Details Panel</span></td><td class="browseDataCell" id="same"></td></tr></table></div>
 <div id="scheduleMatrix"><div class="primaryMatrixCell"><div class="displayPeriodCodeDiv">3</div><div class="dataMatrixCell" data-studentsectionid="123" data-coursedescription="Geometry" data-coursecode="MATH1" data-calendarday="11/2/2026 12:00:00 AM" data-displayperiodid="44"><div class="matrixCellDiv"></div><div class="matrixCellDiv"><div class="matrixCellLeft">Example Teacher</div><div class="matrixCellCenter">101</div><div class="matrixCellRight">S1</div></div></div></div></div>`);
 const students=await page.evaluate(extractStudents);assert.equal(students.length,1);assert.equal(students[0].name,'STUDENT, EXAMPLE');
 const [table]=await page.evaluate(extractGrades);assert.deepEqual(table.rows[0].grades,[{term:'T1',grade:'C-',current:false},{term:'S1',grade:null,current:true}]);assert.equal(table.rows[0].missingAssignments,null);
 const [card]=await page.evaluate(extractSchedule);assert.equal(card.classId,'123');assert.equal(card.date,'11/2/2026');assert.equal(card.period,'3');assert.equal(card.room,'101');
 } finally {await browser.close();}
});

test('assignment extraction excludes totals and locked copies, preserves zero, blanks, and non-numeric scores',async()=>{
 const {extractAssignments}=await import('../dist/extract.js');
 const browser=await chromium.launch({channel:process.env.SKYWARD_BROWSER === 'chromium'?undefined:'chrome',headless:true});
 try {
  const page=await browser.newPage();
  const columns=['','Description','Due Date','Grade','Score','Points Earned','Attempts'];
  const row=(id:string,values:string[],classes='browseRow')=>`<tr id="assignments_${id}" class="${classes}">${values.map(v=>`<td class="browseDataCell">${v}</td>`).join('')}</tr>`;
  await page.setContent(`<div id="GradeBucketAssignmentsSegmentedOuterContainer"><div class="SegmentedAssignmentsReferenceInformation"><span class="SegmentedAssignmentsInformationCell">Example class</span><span class="SegmentedAssignmentsInformationCell"><span class="visualLabel">T1</span></span></div><table><tr class="unlockedHeaderTableRow">${columns.map(c=>`<td><div class="headerTextDiv">${c}</div></td>`).join('')}</tr>
   ${row('unlockedRow0',['','Homework','','A','90%','90 / 100',''],'segmentedBrowseParentRow0')}
   ${row('unlockedRow1',['','<a data-assignment-id="11">Practice<span class="ariadescription">Opens Details</span></a>','11/01/2026','F','0.00%','0.00 / 10.00','1'])}
   ${row('unlockedRow2',['','<a data-assignment-id="12">Pending</a>','11/02/2026','','',' / 20',''])}
   ${row('unlockedRow3',['','Tests','','','',''],'segmentedBrowseParentRow3')}
   ${row('unlockedRow4',['','<a data-assignment-id="13">Excused test</a>','11/03/2026','EX','Excused','EX / 1,000','2'])}
   ${row('lockedRow1',['','<a data-assignment-id="11">Duplicate</a>','','','','',''])}
   </table></div>`);
  const data=await page.evaluate(extractAssignments);
  assert.equal(data?.term,'T1');assert.equal(data?.assignments.length,3);
  assert.deepEqual(data!.assignments[0],{assignmentId:'11',name:'Practice',category:'Homework',dueDate:'11/01/2026',grade:'F',scoreText:'0.00%',pointsText:'0.00 / 10.00',pointsEarned:0,pointsPossible:10,percentage:0,attempts:1});
  assert.equal(data!.assignments[1].pointsEarned,null);assert.equal(data!.assignments[1].pointsPossible,20);
  assert.equal(data!.assignments[2].category,'Tests');assert.equal(data!.assignments[2].pointsEarned,null);assert.equal(data!.assignments[2].pointsPossible,1000);
  assert.equal(data!.assignments[2].scoreText,'Excused');
 } finally {await browser.close();}
});
