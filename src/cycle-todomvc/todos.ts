import 'todomvc-common/base.css'
import 'todomvc-app-css/index.css'

import {Observable, Subject, ReplaySubject, Subscription} from 'rxjs/Rx'
import {action, oneWay, twoWay, signal, collection, CycleSourcesAndSinks, ChangeOrigin, CycleContext, ContextChanges, ChangeType} from '../cycle/plugin'
import {computedFrom} from 'aurelia-framework'
import {TodoItem} from './todo-item'

export class Todos { // implements CycleDriverContext
  // changes$: Subject<ContextChanges>
  
  @action addNewTodoActions
  @action destroyTodo
  @twoWay newTodoTitle
  
  @signal completions
  @signal completionsCreationsDestructions
  
  @collection todos // = new Array<TodoItem>()
  @action filter
  @oneWay currentFilter
  
  @action toggleAll
  @action clearCompleted
  
  cycle({ addNewTodoActions$, destroyTodo$, newTodoTitle$, filter$, todos$ }: CycleSourcesAndSinks & { todos$: Observable<ContextChanges> }): CycleSourcesAndSinks {
    const newTodoProspective$ = addNewTodoActions$.withLatestFrom(
      newTodoTitle$, 
      (action, title) => title as string
    )
    
    const newTodo$ = newTodoProspective$
      .filter(title => title != '')
      .map(title => ({ action: 'added', item: new TodoItem(title, false, this.destroyTodo, this.toggleAll, this.clearCompleted) }))
    
    // every time a new todo is created, reset title
    newTodoTitle$ = newTodoTitle$
      .merge(newTodo$.map(todo => ''))

    const removedTodo$ = destroyTodo$
      .map(args => ({ action: 'removed', item: args[0] }))
    
    const todoChanges$ = Observable
      .merge<any, any>(newTodo$, removedTodo$)
      // .startWith(
      //   { action: 'added', item: new TodoItem('incomplete', false, this.destroyTodo, this.toggleAll, this.clearCompleted) },
      //   { action: 'added', item: new TodoItem('completed', true, this.destroyTodo, this.toggleAll, this.clearCompleted) }
      // )
    
    const currentFilter$ = filter$
      .map(args => args[0])
      .startWith('all')
      .distinctUntilChanged()
    
    // Trigger when any of todo.completed changes
    // so that we can update the filter
    const completions$ = todos$
      .filter(change => change.property === 'isCompleted')

    // Trigger when we create and destroy any Todos to update the X left count
    const completionsCreationsDestructions$ = completions$.merge(
      todos$.filter(change => change.type === ChangeType.Unbind || change.type === ChangeType.Bind)
    )
    
    todos$.subscribe(next => console.log('next', next))

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
        return todos.filter(todo => !todo.isCompleted)
      case 'completed':
        return todos.filter(todo => !!todo.isCompleted)
      default:
        return todos
    }
  }
}

export class CountIncompleteValueConverter {
  toView(todos: Array<TodoItem>) {
    // console.log('counting incomplete', todos)
    
    const count = todos ? todos.filter(todo => !todo.isCompleted).length : 0
    return count
  }
}
