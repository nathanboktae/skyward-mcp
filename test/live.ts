// Explicit opt-in smoke test: authenticates against the configured district.
// Prints counts only, never student identities, credentials, or grades.
import assert from 'node:assert/strict';
import {loadConfig} from '../dist/config.js';
import {SkywardClient} from '../dist/client.js';
const client=new SkywardClient(loadConfig());
try {
 const {students}=await client.listStudents();assert.ok(students.length);
 console.log(`Authenticated; found ${students.length} students.`);
 for(const [i,student] of students.entries()) {
  const quarter=await client.getGrades(student.studentId,{quarter:1});
  const semester=await client.getGrades(student.studentId,{semester:1});
  assert.ok(quarter.classes.length);assert.ok(semester.classes.length);
  assert.ok(quarter.classes.every(c=>c.grades.length===1));
  assert.ok(semester.classes.every(c=>c.grades.length===1));
  const schedule=await client.getSchedule(student.studentId);
  assert.ok(schedule.classes.length);
  assert.ok(schedule.classes.some(c=>quarter.classes.some(g=>g.classId===c.classId)));
  const meetings=schedule.classes.flatMap(c=>c.meetings);
  assert.ok(meetings.some(m=>m.time));
  console.log(`Student ${i+1}: quarter/semester grades passed; ${schedule.classes.length} classes, ${meetings.length} dated meetings, ${meetings.filter(m=>m.time).length} with times.`);
 }
} catch {
 console.error('Live smoke test failed. Check credentials, site availability, and adapter expectations.');process.exitCode=1;
} finally {await client.close();}
