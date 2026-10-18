import test from 'node:test';
import assert from 'node:assert/strict';
import {subjectAssignments} from '../topic-policy.js';

test('HLD caption gets subject tags, not engagement verdicts',()=>{
 const text='35 Minutes for complete HLD discussion, from question to requirements to design to follow ups. Give your verdict of Hire vs reject. SYSTEM DESIGN - OCT 2026';
 const result=subjectAssignments(text,[{name:'Hire vs reject verdict',quote:'Hire vs reject',confidence:0.99,reason:'mentioned'}]);
 assert.deepEqual(result.map(a=>a.name),['System design','HLD']);
});
test('AI motion caption gets subject tags rather than CTA or hosting platform',()=>{
 const text='Follow and comment MOTION. This feels illegal for motion designers. 500+ AI video examples with prompts. I found a GitHub repo packed with AI-generated videos.';
 assert.deepEqual(subjectAssignments(text).map(a=>a.name),['Motion Design','AI Video Generation']);
});
test('supported generic subjects are accepted without a self-reported score cutoff',()=>{
 const text='A guide to sourdough fermentation and feeding a starter.';
 assert.deepEqual(subjectAssignments(text,[{name:'Sourdough Baking',quote:'sourdough fermentation',confidence:0.7,reason:'Main subject'}]).map(a=>a.name),['Sourdough Baking']);
 assert.equal(subjectAssignments(text,[{name:'Cryptocurrency',quote:'Bitcoin',confidence:1,reason:'invented'}]).length,0);
});
test('PDF subjects are recognized locally and unknown content gets no invented tags',()=>{
 assert.deepEqual(subjectAssignments('Machine Learning model answers. Supervised learning.').map(a=>a.name),['Machine Learning']);
 assert.deepEqual(subjectAssignments('Exception handling in Java: try and catch.').map(a=>a.name),['Java','Exception Handling']);
 assert.deepEqual(subjectAssignments('Follow and comment to get the link!'),[]);
});
