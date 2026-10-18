export class OperationCoordinator {
  private queue:Promise<unknown>=Promise.resolve();
  private closing=false;
  run<T>(work:()=>Promise<T>):Promise<T>{
    if(this.closing)return Promise.reject(new Error('应用正在关闭'));
    const run=this.queue.then(()=>{if(this.closing)throw new Error('应用正在关闭');return work();});
    this.queue=run.catch(()=>undefined);return run;
  }
  async close():Promise<void>{this.closing=true;await this.queue;}
}
