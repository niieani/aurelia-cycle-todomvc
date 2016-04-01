import {Observable} from 'rxjs/Rx'
import {bindable, useView} from 'aurelia-framework'
import {action as a, value as v, CycleValue} from '../cycle/plugin'

const ENTER_KEY = 13
const ESC_KEY = 27

@useView('./todo-item.html')
export class TodoItem {
  // cycleDrivers = { }
  
  constructor(title, completed, public destroy$) {
    this.title$ = v(title)
    this.isCompleted$ = v(completed)
  }
  
  bind() {}
  unbind() {}
  
  title$: CycleValue<string>;
  isCompleted$: CycleValue<string>;
  isEditing$ = v()
  
  startEdit$ = a()
  keyUp$ = a()
  doneEdit$: Observable<any> = a()
  
  cycle({ startEdit$, keyUp$, doneEdit$, title$ }: this) {
    // console.log('cycling ITEM', this)
    
    const cancelEdit$ = keyUp$
      .filter((action) => (action[0] as KeyboardEvent).keyCode === ESC_KEY)

    // Allow either enter or blur to finish editing
    doneEdit$ = keyUp$
      .filter((action) => (action[0] as KeyboardEvent).keyCode === ENTER_KEY)
      .merge(doneEdit$)
      .throttleTime(300)
    
    // THE EDITING STREAM
    // Create a stream that emits booleans that represent the
    // "is editing" state.
    const isEditing$ = Observable
      .merge(
        startEdit$.map(() => true),
        doneEdit$.map(() => false),
        cancelEdit$.map(() => false)
      )
      .startWith(false)
      .distinctUntilChanged()
    
    // Destroy when somebody gives a todo an empty name
    const destroy$ = doneEdit$
      .withLatestFrom(title$, (action, title) => title)
      .filter(value => value === '')
      .map(title => [this])
    
    return {
      isEditing$,
      destroy$
    }
  }
}
