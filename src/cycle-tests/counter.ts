import {action, value} from '../cycle/plugin'

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
  
  change$ = action()
  count$ = value()
  
  cycle({ change$ }: this) {
    const changeValue$ = change$
      .map(args => args[0])

    const count$ = changeValue$
      .startWith(0)
      .scan<number>((total, change) => total + change)

    return {
      count$
    }
  }
}
