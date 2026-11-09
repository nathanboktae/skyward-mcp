import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { SkywardClient } from './client.js';
import { SkywardError } from './domain.js';
export function createServer(client: SkywardClient) {
  const server=new McpServer({name:'skyward-mcp',version:'0.6.0'});
  const annotations={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true};
  const studentId=z.string().regex(/^\d+$/).max(30).describe('ID returned by list_students');
  const reply=async(work:()=>Promise<object>)=>{try {const data=await work();return {content:[{type:'text' as const,text:JSON.stringify(data)}],structuredContent:data as Record<string,unknown>};} catch(e) {return {isError:true,content:[{type:'text' as const,text:e instanceof SkywardError ? e.message : 'Skyward operation failed.'}]};}};
  server.registerTool('list_students',{description:'List students accessible to the configured parent account, with school and current school year.',inputSchema:{},annotations},()=>reply(()=>client.listStudents()));
  server.registerTool('get_student_schedule',{description:'Get current classes and dated meetings for the current Skyward week, including teachers, rooms, periods, and local meeting times. Class IDs can be used to filter grades. May take a minute to read class detail dialogs.',inputSchema:{studentId},annotations},({studentId})=>reply(()=>client.getSchedule(studentId)));
  server.registerTool('get_student_grades',{description:'Get current-school-year class grades. Filter by quarter (1–4), semester (1–2), or exact Skyward term, mutually exclusive. Lake Washington quarters use T1–T4. Omit term filters for all terms. Null grades mean unpublished/blank, never zero.',inputSchema:{studentId,quarter:z.number().int().min(1).max(4).optional(),semester:z.number().int().min(1).max(2).optional(),term:z.string().regex(/^[A-Za-z0-9]{1,10}$/).optional(),classId:z.string().regex(/^\d+$/).max(30).optional()},annotations},({studentId,...query})=>reply(()=>client.getGrades(studentId,query)));
  server.registerTool('get_student_assignments',{description:'List assignments for one student, class, and current-school-year term. Use classId from grades or schedule, and exactly one of quarter (1–4), semester (1–2), or exact term (e.g. T1). Returns due dates, categories, grades, percentages, points earned/possible, and attempts. Null scores are blank/non-numeric, never zero. A missing grade breakdown returns an error, not an empty list.',inputSchema:{studentId,classId:z.string().regex(/^\d+$/).max(30),quarter:z.number().int().min(1).max(4).optional(),semester:z.number().int().min(1).max(2).optional(),term:z.string().regex(/^[A-Za-z0-9]{1,10}$/).optional()},annotations},({studentId,classId,...query})=>reply(()=>client.getAssignments(studentId,classId,query)));
  return server;
}
