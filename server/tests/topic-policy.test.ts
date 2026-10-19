import test from 'node:test';
import assert from 'node:assert/strict';
import {subjectAssignments} from '../topic-policy.js';
test('no subject is invented without a model proposal',()=>{
 for(const text of ['Machine Learning','HLD SYSTEM DESIGN','Java Exception Handling','Rangoli','AI video']) assert.deepEqual(subjectAssignments(text),[]);
});
test('topics require source evidence and confidence of at least 70 percent',()=>{
 const text='A guide to sourdough fermentation.';
 const proposal={name:'Sourdough Baking',quote:'sourdough fermentation',confidence:0.7,reason:'Main subject'};
 assert.equal(subjectAssignments(text,[proposal]).length,1);
 assert.equal(subjectAssignments(text,[{...proposal,confidence:0.69}]).length,0);
 assert.equal(subjectAssignments(text,[{...proposal,quote:'invented'}]).length,0);
});
test('accepted model proposals are deduplicated and limited to two',()=>{
 const proposal={name:'Sourdough',quote:'sourdough',confidence:0.9,reason:'Subject'};
 assert.equal(subjectAssignments('sourdough',[proposal,proposal]).length,1);
});
