import 'todomvc-common/base.css'
import 'todomvc-app-css/index.css'

import {Observable, Subject, ReplaySubject, Subscription} from 'rxjs/Rx'
import {action as a, value as v, collection, ChangeOrigin, CycleDriverContext, ContextChanges, ChangeType} from '../cycle/plugin'
import {computedFrom} from 'aurelia-framework'
import {TodoItem} from './todo-item'

export class Todos implements CycleDriverContext {
  changes$: Subject<ContextChanges>
  
  addNewTodoActions$ = a()
  destroyTodo$ = a()
  newTodoTitle$ = v<string>()
  
  completions$ = v() // TODO: this should be a trigger
  completionsCreationsDestructions$ = v() // TODO: like above
  
  todos$ = collection<TodoItem>()
  filter$ = a()
  currentFilter$ = v<string>()
  
  toggleAll$ = a()
  clearCompleted$ = a()
  
  cycle({ addNewTodoActions$, destroyTodo$, newTodoTitle$, filter$, todos$, changes$ }: this) { //: this
    console.log('we are cycling TODOS!', arguments, this)
    
    const newTodoProspective$ = addNewTodoActions$.withLatestFrom(
      newTodoTitle$, 
      (action, title) => title
    )
    
    const newTodo$ = newTodoProspective$
      .filter(title => title != '')
      .map(title => ({ action: 'added', item: new TodoItem(title, false, this.destroyTodo$, this.toggleAll$, this.clearCompleted$) }))
    
    // every time a new todo is created, reset title
    newTodoTitle$ = newTodoTitle$
      .merge(newTodo$.map(todo => ''))

    const removedTodo$ = destroyTodo$
      .map(args => ({ action: 'removed', item: args[0] }))
    
    const todoChanges$ = Observable
      .merge<any, any>(newTodo$, removedTodo$)
      // .startWith(
      //   { action: 'added', item: new TodoItem('incomplete', false, this.destroyTodo$, this.toggleAll$, this.clearCompleted$) },
      //   { action: 'added', item: new TodoItem('completed', true, this.destroyTodo$, this.toggleAll$, this.clearCompleted$) }
      // )
    
    const currentFilter$ = filter$
      .map(args => args[0])
      .startWith('all')
      .distinctUntilChanged()
    
    // Trigger when any of todo.completed changes
    // so that we can update the filter
    const completions$ = todos$
      .filter(change => change.property === 'isCompleted$')

    // Trigger when we create and destroy any Todos to update the X left count
    const completionsCreationsDestructions$ = completions$.merge(
      todos$.filter(change => change.type === ChangeType.Unbind || change.type === ChangeType.Bind)
    )

    return {
      todos$: todoChanges$,
      newTodoTitle$,
      currentFilter$,
      completions$,
      completionsCreationsDestructions$
    }
  }
}

export class FilterTodoValueConverter {
  toView(todos: Array<TodoItem>, currentFilter) {
    // console.log('filtering:', todos, currentFilter)
    
    switch (currentFilter) {
      case 'active':
        return todos.filter(todo => !todo.isCompleted$.now)
      case 'completed':
        return todos.filter(todo => !!todo.isCompleted$.now)
      default:
        return todos
    }
  }
}

export class CountIncompleteValueConverter {
  toView(todos: Array<any>) {
    const count = todos ? todos.filter(todo => !todo.isCompleted$.now).length : 0
    // console.log('counting incomplete', todos)
    return count
  }
}
