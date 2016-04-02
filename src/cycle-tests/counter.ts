import {action, oneWay, twoWay, collection} from '../cycle/plugin'
import {autoinject, ObserverLocator} from 'aurelia-framework'
import {RepeatStrategyLocator} from 'aurelia-templating-resources'
import {Observable} from 'rxjs/Rx'

@autoinject
export class Counter {
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
  
  cycle({ change$, input$ }: { [s: string]: Observable<any> }) {
    const changeValue$ = change$
      .map(args => args[0])

    const count$ = changeValue$
      .startWith(0)
      .scan<number>((total, change) => total + change)
      // .map(count => count.toString())

    input$.subscribe(next => console.log('change', next))

    return {
      count$,
      input$: count$
    }
  }
}
