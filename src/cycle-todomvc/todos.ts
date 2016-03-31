import 'todomvc-common/base.css'
import 'todomvc-app-css/index.css'

import {Observable, Subject, ReplaySubject, Subscription} from 'rxjs/Rx'
import {action as a, value as v, collection} from '../cycle/plugin'
import {computedFrom} from 'aurelia-framework'
import {TodoItem} from './todo-item'


export class Todos {
  addNewTodoActions$ = a()
  destroyTodo$ = a()
  newTodoTitleChanges$ = v()
  
  completionChanges$ = v() //new Subject() //a() // this could be an aggregate?
  
  // todos$ = v()
  todos$ = collection<TodoItem>()
  filter$ = a()
  currentFilter$ = v()
  
  attached() {
    this.completionChanges$.subscribe(completionChange => console.log('completion change', completionChange))
  }
  
  cycle({ addNewTodoActions$, destroyTodo$, newTodoTitleChanges$, filter$, todos$ }: this) { //: this
    console.log('we are cycling TODOS!', arguments, this)
    
    const newTodoProspective$ = addNewTodoActions$.withLatestFrom(
      newTodoTitleChanges$, 
      (action, title) => title
    )
    
    const newTodo$ = newTodoProspective$
      .filter(title => title != '')
      .map(title => ({ action: 'added', item: new TodoItem(title, false, destroyTodo$) }))
    
    // reset title after adding
    const newTodoTitle$ = newTodoTitleChanges$
      .merge(newTodo$.map(todo => ''))
      .startWith('')

    const removedTodo$ = destroyTodo$
      .map(args => ({ action: 'removed', item: args[0] }))
    
    const todoChanges$ = Observable
      .merge<any, any>(newTodo$, removedTodo$)
      .startWith(
        { action: 'added', item: new TodoItem('incomplete', false, destroyTodo$) },
        { action: 'added', item: new TodoItem('completed', true, destroyTodo$) }
      )// as Observable<{ action:string, todo:ITodo }>
    
    // const todos$ = todoChanges$
    //   .scan<Array<TodoItem>>((array, change) => {
    //     if (change.action == 'added') {
    //       array.push(change.todo)
    //     }
    //     else {
    //       array.splice(array.indexOf(change.todo), 1)
    //     }
    //     return array
    //   }, [])
    //   .share()
    
    const currentFilter$ = filter$
      .map(args => args[0])
      .startWith('all')
      .distinctUntilChanged() //.do(change => console.log('filter change', change))
    
    // I need to be notified on any change of any completed observable
    // and need to know the parent object that complete belongs to
    // so my observable needs to be triggered when any of todo.completed changes
    const completionChanges$ = todos$
      .filter(change => change.property === 'isCompleted$')
      .do(completionChange => console.log('completion change', completionChange))

    // merge(todo.completed, todo.completed, ...)
    // and it's value needs to be the todo object
    // todos$.flatMap()
    // const completionChanges$ = todos$.map(todosArray => {
    //   const observables = todosArray.map(todo => todo.isCompleted$.map(completed => ({ todo, isCompleted: completed })))
    //   return Observable.merge(...observables)
    // }).mergeAll().share()//.do(completionChange => console.log('completion change', completionChange))
    
    // const betterCompletionChanges$ = todoChanges$.
    
    return {
      todos$: todoChanges$,
      newTodoTitle$,
      currentFilter$,
      completionChanges$
    }
  }
}

export class FilterTodoValueConverter {
  toView(todos: Array<any>, currentFilter) {
    console.log('filtering:', todos, currentFilter)
    // return todos;
    switch (currentFilter) {
      case 'active':
        // return todos.filter(todo => !todo.completed.last)
        return todos.filter(todo => !todo.isCompleted$.value)
      case 'completed':
        return todos.filter(todo => todo.isCompleted$.value)
        // return todos.filter(todo => todo.completed.last)
      default:
        return todos
    }
  }
}

export class CountIncompleteObservableValueConverter {
  toView(todos: Observable<Array<any>> & { value: Array<any> }) {
    const count = todos && todos.value ? todos.value.filter(todo => !todo.isCompleted$.value).length : 0
    console.log('counting incomplete', todos)
    return count
  }
}

export class CountIncompleteValueConverter {
  toView(todos: Array<any>) {
    const count = todos ? todos.filter(todo => !todo.isCompleted$.value).length : 0
    console.log('counting incomplete', todos)
    return count
  }
}


    // TODO: problem with todoCompletionChanges is that 
    // it gets retriggered every time todos$ changes (added/removed todo)
    // it should be triggered only for active todos
    
    // const todoCompletedCount$ = todoCompletionChanges$.filter(change => change.completed === true).map(completed => -1)
    // const todoIncompleteCount$ = todoCompletionChanges$.filter(change => change.completed === false).map(completed => +1)
    
    // // const todosLeftCount$ = Observable
    // //   .merge<number, number>(todoCompletedCount$, todoIncompleteCount$)
    // //   .startWith(0)
    // //   .scan<number>((total, change) => total + change)
    
    // // every time todos$ changes, we recalculate the count
    // const startCount$ = todos$.map(arrayChange => 0)
    // const todosLeftCount$ = Observable
    //   .merge<number, number>(todoCompletedCount$, todoIncompleteCount$)
    //   .startWith(0)
    //   .scan<number>((total, change) => total + change)
      
    // TODO: FIX Signaling (perhaps the Signaler is not the same instance?), TEST!
    
    // //
    // const todoVisibilityChanges$ = Observable.combineLatest(todoCompletionChanges$, currentFilter$, 
    //   (completionChanges, filter) => {
    //     switch(filter) {
    //       case 'all': 
    //         return { visible: true, todo: completionChanges.todo }
    //       case 'active':
    //         return { visible: !completionChanges.completed, todo: completionChanges.todo } //!completionChanges.completed ? completionChanges.todo : null
    //       case 'completed':
    //         return { visible: completionChanges.completed, todo: completionChanges.todo }
    //     }
    //   }
    // ).do(visibilityChange => console.log('visibility change', visibilityChange))
    
    // // todos$.
    // const visibleTodos$ = todoVisibilityChanges$
    //   .scan<Array<ITodo>>((array, change) => {
    //     if (change.visible) {
    //       array.push(change.todo)
    //     }
    //     else {
    //       array.splice(array.indexOf(change.todo), 1)
    //     }
    //     return array
    //   }, [])
    
    // const filteredTodos$ = todoCompletionChanges$.
    
    // const bindableTodos$ = todos$
    //   .map(todosArray => {
    //     return todosArray.map(todo => {
    //       const bindableObject = {}
    //       Object.getOwnPropertyNames(todo).forEach(
    //         property => bindableObject[property] = c(todo[property])
    //       )
    //       console.log('bindable todo', bindableObject, todo)
    //       return bindableObject
    //     })
    //   })
