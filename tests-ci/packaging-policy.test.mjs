import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('desktop packaging never publishes a release when invoked from a CI tag',()=>{
 const child=spawnSync(process.execPath,['--input-type=module','-e',`
  import{readFileSync}from'node:fs';import{createRequire}from'node:module';
  const require=createRequire(process.cwd()+'/package.json');
  const{PublishManager}=require('app-builder-lib/out/publish/PublishManager.js');
  const command=JSON.parse(readFileSync('package.json','utf8')).scripts['desktop:dist'];
  const publish=command.match(/--publish\\s+(\\w+)/)?.[1];
  const manager=new PublishManager({onAfterPack(){},onArtifactCreated(){}},{publish});
  console.log('PUBLISH_ENABLED='+manager.isPublish);
 `],{encoding:'utf8',env:{...process.env,GITHUB_REF_TYPE:'tag',GITHUB_REF_NAME:'desktop-build-policy-fixture'}});
 assert.equal(child.status,0,child.stderr);assert.match(child.stdout,/PUBLISH_ENABLED=false/);
});
