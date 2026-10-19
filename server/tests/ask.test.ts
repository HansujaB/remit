import test from 'node:test';
import assert from 'node:assert/strict';
import { compactEvidence } from '../ask-context.js';
import { exploreLibrary } from '../ask-agent.js';
import { lexical } from '../retrieval.js';

test('conversational filler does not match unrelated saves',()=>{
  assert.equal(lexical('Rangoli patterns revision','Did I save something related to interview prep?'),0);
});

test('Ask only exposes bounded whitelisted excerpts, with per-save diversity', () => {
  const rows = Array.from({length:30}, (_,i) => ({id:String(i),itemId:String(Math.floor(i/3)),
    title:'t'.repeat(1000),text:'x'.repeat(20000)+' interview '+ 'y'.repeat(20000),
    extraction:'PRIVATE FULL DOCUMENT', vector:[1,2], secret:'hidden'}));
  const selected = compactEvidence(rows,'interview');
  assert.ok(selected.length<=8);
  assert.ok(selected.reduce((n,e)=>n+e.text.length,0)<=6000);
  assert.ok(selected.every(e=>e.text.includes('interview') && e.text.length<=750));
  assert.ok(!JSON.stringify(selected).includes('PRIVATE FULL DOCUMENT'));
  assert.ok(selected.every(e=>!('vector' in e) && !('secret' in e)));
});

test('broad discovery explores actual topics, adapts to results, and retains original scope', async () => {
  const calls:any[] = [], inputs:any[] = [];
  const lib:any = {q:async (query:string, params:any) => {
    calls.push({query,params});
    if(query.includes('count(DISTINCT')) return [{name:'HLD',count:1},{name:'DBMS',count:1},{name:'ML',count:1}];
    if(query.includes('seed:Item')) return [{id:'c3',itemId:'3',seedId:'1',concept:'databases',title:'ML',text:'small source'}];
    return params.ids.map((id:string)=>({id,title:id,topics:id==='1'?['HLD']:id==='2'?['DBMS']:['ML']}));
  }};
  const search:any = async (_lib:any,o:any) => {
    if(!o.query) return {ids:['1','2','3'], evidence:[],warnings:[]};
    const id=o.topic==='HLD'?'1':'2';
    return {ids:[id,'other-user'],evidence:[{id:'c'+id,itemId:id,title:o.topic,text:'PRIVATE CONTENT'},
      {id:'evil',itemId:'other-user',text:'hidden'}],warnings:[]};
  };
  const decisions:any[] = [
    {intent:'discover',tool:'explore_topics',query:'',topics:['HLD','DBMS','invented'],clarification:'Which role?'},
    {intent:'discover',tool:'find_connected_saves',query:'',topics:[],clarification:''},
    {intent:'answer',tool:'finish',query:'',topics:[],clarification:''},
  ];
  const result = await exploreLibrary(lib,{query:'Did I save interview prep?',favorite:true},search,async input=>{
    inputs.push(input);return decisions.shift();
  },async()=>({matches:[{id:'1',reason:'Relevant',confidence:0.9},{id:'2',reason:'Relevant',confidence:0.7},{id:'3',reason:'Weak relation',confidence:0.69}],clarification:''}));
  assert.deepEqual(result.selectedTopics,['HLD','DBMS']);
  assert.equal(result.clarification,'Which role?');
  assert.equal(result.intent,'discover');
  assert.deepEqual(result.trace.map(t=>t.tool),['list_topics','explore_topics','find_connected_saves','check_relevance']);
  assert.equal(result.matches.length,2);
  assert.ok(!result.evidence.some(e=>e.itemId==='3'));
  assert.ok(result.evidence.every(e=>e.itemId!=='other-user'));
  assert.ok(!JSON.stringify(inputs).includes('PRIVATE CONTENT'));
  assert.ok(inputs[1].matches.length>0);
  assert.deepEqual(calls.find(c=>c.query.includes('seed:Item')).params.seeds,['1','2']);
});

test('planner failure falls back to search without endless tool calls', async()=>{
  let searches=0;
  const lib:any={q:async()=>[]};
  const search:any=async()=>{searches++;return {ids:[],evidence:[],warnings:[]};};
  const result=await exploreLibrary(lib,{query:'cache'},search,async()=>{throw Error('unavailable');});
  assert.ok(searches<=3);
  assert.ok(result.warnings.length>0);
});
