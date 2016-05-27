import {action, oneWay, twoWay, collection, CycleContext, CycleSourcesAndSinks} from 'aurelia-cycle'
import {autoinject, ObserverLocator} from 'aurelia-framework'
import {RepeatStrategyLocator} from 'aurelia-templating-resources'
import {Observable} from 'rxjs/Rx'

@autoinject
export class Counter implements CycleContext {
  // cycleDrivers = { extra drivers go here }
  // count = value()
  // tasks = array()
  
  // tasks: { action: 'add', item: { }, id: 1 }
  // tasks: { action: 'remove', item: { }, id: 1 }
  // tasks: { action: 'update', }
  
  // taskChanges = new ReplySubject<any>()
  // all-task-changes.bind="taskChanges"
  // allTaskChanges.filter(task => task.id === this.id)
  // arr = []
  // someVal = ''
  
  // constructor(public observerLocator: ObserverLocator, public strategyLocator: RepeatStrategyLocator) {
    
  //   observerLocator.getObserver(this, 'arr').subscribe(change => {
  //     console.log('arr obs change', change)
  //   })
    
  //   let arr = this.arr
    
  //   let strategy = strategyLocator.getStrategy(arr)
  //   let collectionObs = strategy.getCollectionObserver(observerLocator, arr)
  //   collectionObs.subscribe(change => {
  //     console.log('collection change', change)
  //   })
    
  //   console.log('collection obs', collectionObs)
    
  //   observerLocator.getArrayObserver(arr).subscribe(change => {
  //     console.log('arr change', change)
  //   })
  //   arr.push('1')
  //   // arr.push('2')
  //   // arr.push('3')
  //   // arr.splice(1, 1)
  //   // arr.splice(1, 1, '3-replaced')
    
  //   observerLocator.getObserver(this, 'someVal').subscribe(change => {
  //     console.log('someVal change', change)
  //   })
  //   this.someVal = 'hmm'
  //   this.someVal = 'hmm2'
  // }
  
  // input = ''
  // input$: Observable<string>;
  
  @twoWay input; //$: Observable<string>;
  
  @action change; //$: Observable<Array<any>>;
  
  // change$ = action()
  // count$ = value()
  @oneWay count; //$: Observable<string>;
  
  @collection arr = ['huh'];
  
  // bind() {
  //   setTimeout(()=>this.arr = ['lolz'], 3000)
  // }
  
  cycle({ change$, input$ }: CycleSourcesAndSinks): CycleSourcesAndSinks {
    const changeValue$ = change$
      .map(args => args[0])

    const count$ = changeValue$
      .startWith(0)
      .scan<number>((total, change) => total + change)
      .map(count => String(count))

    input$.subscribe(next => console.log('change', next))

    const arr$ = count$.map(v => ({ action: 'added', item: v }))

    return {
      count$,
      input$: count$,
      arr$
    }
  }
}
