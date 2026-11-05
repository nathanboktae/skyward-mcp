import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {extractStudents,extractGrades,extractSchedule} from '../dist/extract.js';
test('DOM extraction handles duplicate cell IDs, hidden accessibility text, blanks, and dated class identity',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
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
