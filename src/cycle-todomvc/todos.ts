import 'todomvc-common/base.css'
import 'todomvc-app-css/index.css'

import {Observable, Subject, ReplaySubject, Subscription} from 'rxjs/Rx'
import {action, oneWay, twoWay, signal, collection, CycleSourcesAndSinks, ChangeOrigin, CycleContext, ContextChanges, ChangeType} from '../cycle/plugin'
import {autoinject} from 'aurelia-framework'
import {TodoItem} from './todo-item'
import {activationStrategy} from 'aurelia-router';

// @autoinject
export class Todos { // implements CycleDriverContext
	activate(params, routeConfig) {
    this.currentFilter = routeConfig.name;
	}
  
  determineActivationStrategy(): string {
    return activationStrategy.invokeLifecycle;
  }
  
  bind() {
    console.log('bind')
  }

  // changes$: Subject<ContextChanges>
  
  @action addNewTodoActions
  @action destroyTodo
  @twoWay newTodoTitle
  
  @signal completions
  @signal creationsAndDestructions
  
  @collection todos
  @action filter
  @oneWay currentFilter
  
  @action toggleAll
  @action clearCompleted
  
  cycle({ addNewTodoActions$, destroyTodo$, newTodoTitle$, filter$, todos$, clearCompleted$, activate$ }: CycleSourcesAndSinks & { todos$: Observable<ContextChanges> }): CycleSourcesAndSinks {
    // activate$.subscribe(next => console.log('subscribe', next))
    const newTodoProspective$ = addNewTodoActions$.withLatestFrom(
      newTodoTitle$, 
      (action, title) => (title as string).trim()
    )
    
    const todoAdditions$ = newTodoProspective$
      .filter(title => !!title)
      .map(title => ({ action: 'add', item: new TodoItem(title, false, this.destroyTodo, this.toggleAll) }))
    
    // every time a new todo is created, reset title
    newTodoTitle$ = todoAdditions$.map(todo => '')

    const todoRemovals$ = destroyTodo$
      .map(args => ({ action: 'remove', item: args[0] }))
    
    clearCompleted$ = clearCompleted$.map(() => ({
      action: 'do',
      where: (item: TodoItem) => item.isCompleted,
      do: (item: TodoItem) => this.destroyTodo(item)
    }))
    
    const todoChanges$ = Observable
      .merge(todoAdditions$, todoRemovals$, clearCompleted$)
    
    // const currentFilter$ = filter$
    //   .map(args => args[0])
    //   .startWith('all')
    //   .distinctUntilChanged()
    
    // Trigger when any of todo.completed changes
    // so that we can update the filter
    const completions$ = todos$
      .filter(change => change.property === 'isCompleted')

    // Trigger when we create and destroy any Todos to update the X left count
    const creationsAndDestructions$ = 
      todos$.filter(change => change.type === ChangeType.Unbind || change.type === ChangeType.Bind)

    return {
      todos$: todoChanges$,
      newTodoTitle$,
      // currentFilter$,
      completions$,
      creationsAndDestructions$
    }
  }
}

export class FilterTodoValueConverter {
  toView(todos: Array<TodoItem>, currentFilter) {
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
    const count = todos ? todos.filter(todo => !todo.isCompleted).length : 0
    return count
  }
}

export class CountCompleteValueConverter {
  toView(todos: Array<TodoItem>) {
    const count = todos ? todos.filter(todo => todo.isCompleted).length : 0
    return count
  }
}

export class AnyValueConverter {
  toView(count: number) {
    return count > 0
  }
}
