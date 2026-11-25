"use strict";
function parse(value) {
  const match=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value);
  if(!match) throw Error("Invalid channel version");
  const prerelease=match[4]?.split(".")||null;
  if(prerelease?.some(part=>/^0\d+$/.test(part)))throw Error("Invalid numeric prerelease");
  return [match.slice(1,4).map(BigInt),prerelease];
}
function compareVersions(left,right) {
  const [a,x]=parse(left),[b,y]=parse(right);
  for(let i=0;i<3;i++)if(a[i]!==b[i])return a[i]>b[i]?1:-1;
  if(!x&&!y)return 0;
  if(!x)return 1;
  if(!y)return -1;
  for(let i=0;i<Math.max(x.length,y.length);i++){
    if(x[i]===y[i])continue;
    if(x[i]===undefined)return -1;
    if(y[i]===undefined)return 1;
    const n=/^\d+$/;
    if(n.test(x[i])&&n.test(y[i]))return BigInt(x[i])>BigInt(y[i])?1:-1;
    if(n.test(x[i])!==n.test(y[i]))return n.test(x[i])?-1:1;
    return x[i]>y[i]?1:-1;
  }
  return 0;
}
function assertChannelAdvance(channel,current,version) {
  if(!["latest","alpha","beta","next"].includes(channel))throw Error("Unknown release channel");
  parse(version);
  if(channel==="latest"&&(!current||version.includes("-")||current.includes("-")))throw Error("Expected stable latest");
  if(current&&compareVersions(current,version)>0)throw Error("Refusing dist-tag regression");
}
if(require.main===module){try{assertChannelAdvance(...process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={compareVersions,assertChannelAdvance};
