import {Observable} from 'rxjs/Rx'
import {bindable, useView} from 'aurelia-framework'
import {action as a, value as v, CycleValue} from '../cycle/plugin'

const ENTER_KEY = 13
const ESC_KEY = 27

@useView('./todo-item.html')
export class TodoItem {
  // You may define additional drivers here:
  // cycleDrivers = { }
  
  constructor(
    title: string, completed: boolean, 
    public destroy$: Observable<any>, 
    public toggle$: Observable<any>, 
    public clearIfCompleted$: Observable<any>
  ) {
    this.title$ = v(title)
    this.isCompleted$ = v(completed)
  }
  
  title$: CycleValue<string>;
  isCompleted$: CycleValue<boolean>;
  isEditing$ = v<boolean>()
  
  startEdit$ = a()
  keyUp$ = a()
  doneEdit$ = a() as Observable<any>
  
  cycle({ startEdit$, keyUp$, doneEdit$, title$, toggle$, isCompleted$, clearIfCompleted$ }: this) {
    const cancelEdit$ = keyUp$
      .filter((action) => (action[0] as KeyboardEvent).keyCode === ESC_KEY)

    // Allow either enter or blur to finish editing
    doneEdit$ = keyUp$
      .filter((action) => (action[0] as KeyboardEvent).keyCode === ENTER_KEY)
      .merge(doneEdit$)
      .throttleTime(300)
    
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
    
    const clearCommand = clearIfCompleted$.withLatestFrom(
      isCompleted$.filter(completed => completed === true), 
      (action, completed) => [this]
    )
    
    // Destroy when somebody gives a todo an empty name
    const destroy$ = doneEdit$
      .withLatestFrom(title$, (action, title) => title)
      .filter(value => value === '')
      .map(title => [this])
      .merge(clearCommand)
    
    const toggledIsCompleted$ = toggle$.
      withLatestFrom(isCompleted$, (toggle, isCompleted) => true)
      // withLatestFrom(isCompleted$, (toggle, isCompleted) => !isCompleted)
    
    return {
      isEditing$,
      destroy$,
      isCompleted$: toggledIsCompleted$
    }
  }
}
