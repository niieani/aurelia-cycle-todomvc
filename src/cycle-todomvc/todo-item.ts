import {Observable} from 'rxjs/Rx'
import {bindable, useView} from 'aurelia-framework'
import {action, oneWay, twoWay, collection, CycleSourcesAndSinks} from '../cycle/plugin'

const ENTER_KEY = 13
const ESC_KEY = 27

@useView('./todo-item.html')
export class TodoItem {
  // You may define additional drivers here:
  // cycleDrivers = { }
  
  constructor(
    title: string,
    completed: boolean, 
    destroy, 
    toggle, 
    clearIfCompleted
  ) {
    this.title = title
    this.isCompleted = completed
    // external actions
    this.destroy = destroy
    this.toggle = toggle
    this.clearIfCompleted = clearIfCompleted
  }
  
  @twoWay title;
  @twoWay isCompleted;
  @oneWay isEditing;
  
  // internal actions
  @action startEdit;
  @action keyUp;
  @action doneEdit;
  
  // external actions
  @action destroy;
  @action toggle;
  @action clearIfCompleted;
  
  cycle({ startEdit$, keyUp$, doneEdit$, title$, toggle$, isCompleted$, clearIfCompleted$ }: CycleSourcesAndSinks): CycleSourcesAndSinks {
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
    
    const clearCommand$ = clearIfCompleted$.withLatestFrom(
        isCompleted$,
        (action, completed) => completed
      )
      .filter(completed => completed === true)
      .map(action => [this])
    
    // Destroy when somebody gives a todo an empty name
    const destroy$ = doneEdit$
      .withLatestFrom(title$, (action, title) => title)
      .filter(value => value === '')
      .map(title => [this])
      .merge(clearCommand$)
    
    const toggledIsCompleted$ = toggle$
      .withLatestFrom(isCompleted$, (toggle, isCompleted) => true)
    
    return {
      isEditing$,
      destroy$,
      isCompleted$: toggledIsCompleted$
    }
  }
}
