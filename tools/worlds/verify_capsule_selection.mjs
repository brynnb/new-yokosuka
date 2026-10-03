// Execute the original selection instructions, not a second translation of the
// policy. This deliberately bounded SH-4 harness stops before presentation.
import fs from 'node:fs';
import {createHash} from 'node:crypto';

const source = fs.readFileSync('.disc-work/exact/d000/MAPINFO.BIN');
const sha = b => createHash('sha256').update(b).digest('hex');
if (sha(source) !== '7712f3ae8c9e154b3831bc8d8af31ebc135f35d930ae50c503a65e3af34e9b7e') throw Error('Unreviewed D000 binary');
const evidence = JSON.parse(fs.readFileSync('tools/evidence/d000-gacha-interaction.json'));
const names = JSON.parse(fs.readFileSync('src/data/collection-model-names.json')).items;
const item = (cat, index) => {
  const c = evidence.prizeLookup.categories[cat];
  return `capsule_${names['G_ITEM_' + c.mt5Tokens[index].slice(1)].resourceCode.toLowerCase()}`;
};
const fb = Buffer.alloc(4);
const bits = f => { fb.writeFloatLE(f); return fb.readUInt32LE(); };
const float = i => { fb.writeUInt32LE(i >>> 0); return fb.readFloatLE(); };

function execute(category, seed, owned) {
  const mem = Buffer.alloc(0x140000); source.copy(mem);
  const r = new Uint32Array(16), f = new Float32Array(16);
  r[8] = 0x100000; r[9] = 0x110000; r[13] = 0x130000;
  mem.writeUInt32LE(0xa2480, r[8]+4);
  let t = 0, fpul = 0, pc = 0x56ed4, count = 0;
  const draws = [], queries = [];
  const draw = n => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    const value = Math.floor((seed >>> 0) / 2**32 * n);
    draws.push({bound: n, value}); return value;
  };
  const read = a => mem.readUInt32LE(a);
  const write = (a, v) => mem.writeUInt32LE(v >>> 0, a);
  function instruction(at) {
    const op = mem.readUInt16LE(at), n = (op >> 8) & 15, m = (op >> 4) & 15;
    const top = op >>> 12, low = op & 15;
    const signed8 = (op << 24) >> 24;
    if (op === 0x0009) return; // nop / delay slot
    if (top === 0xe) r[n] = signed8;
    else if (top === 0x7) r[n] += signed8;
    else if (top === 0xd) r[n] = read(((at+4)&~3)+(op&255)*4);
    else if (top === 0x5) r[n] = read(r[m]+low*4);
    else if (top === 0x1) write(r[n]+low*4,r[m]);
    else if (top === 0x6 && low === 3) r[n] = r[m];
    else if (top === 0x6 && low === 2) r[n] = read(r[m]);
    else if (top === 0x6 && low === 0) r[n] = mem.readInt8(r[m]);
    else if (top === 0x6 && low === 6) { r[n] = read(r[m]); r[m] += 4; }
    else if (top === 0x6 && low === 7) r[n] = ~r[m];
    else if (top === 0x2 && low === 2) write(r[n],r[m]);
    else if (top === 0x2 && low === 0) mem.writeUInt8(r[m]&255,r[n]);
    else if (top === 0x2 && low === 6) { r[n] -= 4; write(r[n],r[m]); }
    else if (top === 0x2 && low === 9) r[n] &= r[m];
    else if (top === 0x2 && low === 11) r[n] |= r[m];
    else if (top === 0x3 && low === 12) r[n] += r[m];
    else if (top === 0x3 && low === 8) r[n] -= r[m];
    else if (top === 0x3 && low === 10) { const value=r[n]-r[m]-t; r[n]=value; t=Number(value<0); }
    else if (top === 0x3 && low === 0) t=Number(r[n]===r[m]);
    else if (top === 0x3 && low === 7) t=Number((r[n]|0)>(r[m]|0));
    else if (top === 0x3 && low === 3) t=Number((r[n]|0)>=(r[m]|0));
    else if ((op&0xff00)===0x8800) t=Number((r[0]|0)===signed8);
    else if ((op&0xf00f)===0x000e) r[n]=read(r[m]+r[0]);
    else if ((op&0xf0ff)===0x4022) {r[n]-=4;write(r[n],0);} // saved PR, never returned through
    else if ((op&0xf0ff)===0x405a) fpul=r[n];
    else if ((op&0xf0ff)===0x005a) r[n]=fpul;
    else if ((op&0xf0ff)===0xf00d) f[n]=float(fpul);
    else if ((op&0xf0ff)===0xf01d) fpul=bits(f[n]);
    else if (top===0xf&&low===5) t=Number(f[n]>f[m]);
    else if (top===0xf&&low===1) f[n]-=f[m];
    else throw Error(`Unsupported instruction ${op.toString(16)} at ${at.toString(16)}`);
  }
  while (pc !== 0x57a78) {
    if (++count>10000 || pc<0x56ed4 || pc>=0x57a78) throw Error(`Unexpected selection flow ${pc.toString(16)}`);
    const op=mem.readUInt16LE(pc), n=(op>>8)&15;
    if ((op&0xff00)===0x8b00) {pc = t ? pc+2 : pc+4+((op<<24)>>24)*2;continue;}
    if ((op&0xf0ff)===0x0023) {const target=pc+4+(r[n]|0);instruction(pc+2);pc=target;continue;}
    if ((op&0xf0ff)===0x0003) {
      const target=pc+4+(r[n]|0);instruction(pc+2);
      if(target!==0x4fe10)throw Error(`Unexpected source call ${target.toString(16)}`);
      const c=read(r[13]), i=read(r[13]+4);
      r[0]=Number(evidence.prizeLookup.categories[c].lookupValues[i]);
      queries.push([c,i]); pc+=4;continue;
    }
    if((op&0xf0ff)===0x400b) {
      instruction(pc+2); const args=r[6];
      switch(r[5]) {
        case 0x24:r[0]=category;break;
        case 9:if(read(args)!==16)throw Error('Not RNG'); r[0]=bits(draw(1<<24)/(1<<24)*float(read(args+4)));break;
        case 0x4f:if(read(args)!==6)throw Error('Not integer RNG');r[0]=draw(read(args+4));break;
        case 0x3f:{const [c,i]=queries.at(-1);r[0]=owned[item(c,i)]||0;break;}
        default:throw Error(`Unexpected engine operation ${r[5]}`);
      }
      pc+=4;continue;
    }
    instruction(pc);pc+=2;
  }
  return {draws, queries, category:read(r[14]+0x1c), index:read(r[14]+0x20)};
}

const cases=[];
for(const category of [2,4]) for(let seed=1;seed<=400;seed++) {
  const pool=evidence.prizeLookup.categories[category];
  const owned=Object.fromEntries(pool.lookupValues.flatMap((_,i)=>((seed+i)%3===0?[[item(category,i),1]]:[])));
  const result=execute(category, seed*2654435761, owned);
  cases.push({machineId: category===4?'dobuita-gch0':'dobuita-gch3', owned, draws:result.draws,
    want:item(result.category,result.index), nativeCategory:result.category,nativeIndex:result.index});
}
const output=process.argv[2];
if(!output)throw Error('Pass output JSON path for native selection vectors');
fs.writeFileSync(output,JSON.stringify({sourceSha256:sha(source),cases},null,2)+'\n');
console.log(`Executed ${cases.length} original D000 selection traces`);
