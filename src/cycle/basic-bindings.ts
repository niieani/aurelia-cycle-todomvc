import {defineDriverCreator, DriverCreator} from './plugin'
import {Observable, Observer, Subscription, BehaviorSubject, ReplaySubject, Subject, Subscriber} from 'rxjs/Rx'

import rxjsAdapter from '@cycle/rxjs-adapter'
import { DriverFunction } from '@cycle/base'
import {LogManager, FrameworkConfiguration, declarePropertyDependencies, computedFrom, autoinject, Container} from 'aurelia-framework';
import {BindingSignaler} from 'aurelia-templating-resources'

// for ObservableSignalBindingBehavior
import {Binding, sourceContext, ObserverLocator, InternalPropertyObserver} from 'aurelia-binding'
import {RepeatStrategyLocator, NullRepeatStrategy} from 'aurelia-templating-resources'

export class BindingType {
  static Value = 'value'
  static Action = 'action'
  static Collection = 'collection'
  static Context = 'context'
}

export class ChangeType {
  static Value = 'value'
  static Action = 'action'
  static Add = 'add'
  static Remove = 'remove'
  static Do = 'do'
  static Bind = 'bind'
  static Unbind = 'unbind'
  static Signal = 'signal'
}

export class ChangeOrigin {
  static View = 'View'
  static ViewModel = 'ViewModel'
  static InitialValue = 'InitialValue'
  static Unknown = 'Unknown'
}

export interface BindingChange<T> {
  now: T;
  origin: ChangeOrigin;
  type: ChangeType;
}

export interface ContextChanges extends BindingChange<any> {
  property: string;
}

export interface CollectionChanges<T> extends ContextChanges {
  item: T;
}

export interface CollectionChange<T> {
  action: 'add' | 'remove' | 'do';
  item: T & { changes$: Observable<ContextChanges> };
  where: (item: T) => boolean;
  do: (item: T) => void;
}

export type CycleValue<T> = Observable<T> & { now?: T };

export type ValueAndOrigin<T> = {now: T, origin: ChangeOrigin}

export type Collection<T> = Subject<CollectionChanges<T>> & { now: Array<T> }
export type CycleSourcesAndSinks = { [s: string]: Observable<any> }

export interface CycleContext {
  changes$?: Subject<ContextChanges>;
  cycle: (sources: CycleSourcesAndSinks) => CycleSourcesAndSinks;
}

@autoinject
export class OneWayDriverCreator implements DriverCreator {
  makeDriver(context: any, propertyName: string, contextChanges: Subject<ContextChanges>) {
    let subscription: Subscription
    const driverCreator: DriverFunction = (value$: Observable<string>) => {
      subscription = value$.subscribe(newValueFromContext => {
        if (newValueFromContext !== context[propertyName]) {
          context[propertyName] = newValueFromContext
          const next = { property: propertyName, now: newValueFromContext, origin: ChangeOrigin.ViewModel, type: ChangeType.Value }
          contextChanges.next(next)
        }
      })
      return Observable.empty()
    }
    
    driverCreator.streamAdapter = rxjsAdapter
    return { 
      driverCreator,
      dispose: () => {
        if (subscription) subscription.unsubscribe()
      }
    }
  }
}

@autoinject
export class TwoWayDriverCreator implements DriverCreator {
  constructor(private observerLocator: ObserverLocator) {}
  
  makeDriver(context: any, propertyName: string, contextChanges: Subject<ContextChanges>) {
    // const value = drivers[propertyName]
    // const strategy = strategyLocator.getStrategy(value)
    // if (!strategy || strategy instanceof NullRepeatStrategy) {
    // non-repeatable
    const aureliaObserver = this.observerLocator.getObserver(context, propertyName)
    
    const subject = new BehaviorSubject<any>(aureliaObserver.getValue())
    
    const callable = (newValue, oldValue) => {
      subject.next(newValue)
      const next = { property: propertyName, now: newValue, origin: ChangeOrigin.Unknown, type: ChangeType.Value }
      contextChanges.next(next)
    }
    
    aureliaObserver.subscribe(callable)
    
    let subscription: Subscription
    
    const driverCreator: DriverFunction = (value$: Observable<string>) => {
      // console.log('created context driver for', propertyName, value$)
      subscription = value$.subscribe(newValueFromContext => {
        // console.log('will change value', newValueFromContext)
        if (newValueFromContext !== aureliaObserver.getValue()) {
          aureliaObserver.setValue(newValueFromContext)
        }
      })
      
      return subject.asObservable()    
    }
    
    driverCreator.streamAdapter = rxjsAdapter
    return { 
      driverCreator,
      dispose: () => {
        aureliaObserver.unsubscribe(callable)
        if (subscription)
          subscription.unsubscribe()
      }
    }
  }
}

const signalInstanceCount = new Map<string, number>()
function getSignalNameWithUniqueCount(name: string) {
  let current = signalInstanceCount.get(name)
  if (current !== undefined) {
    current++
  } else {
    current = 0
  }
  signalInstanceCount.set(name, current)
  return `${name}:${current}`
}

@autoinject
export class SignalDriverCreator implements DriverCreator {
  constructor(private signaler: BindingSignaler) {}
  
  makeDriver(context: any, propertyName: string, contextChanges: Subject<ContextChanges>) {
    const signalName = context[propertyName] || (context[propertyName] = getSignalNameWithUniqueCount(`${context.constructor.name}:${propertyName}`)) //Math.random().toString(36).slice(2)

    let subscription: Subscription
    
    const driverCreator: DriverFunction = (value$: Observable<string>) => {
      subscription = value$
        .throttleTime(100) // don't signal too often
        .subscribe(newValueFromContext => {
          this.signaler.signal(signalName)
          // console.log('signalling', signalName)
          const next = { property: propertyName, now: signalName, origin: ChangeOrigin.ViewModel, type: ChangeType.Signal }
          contextChanges.next(next)
        })
      return Observable.empty()
    }
    
    driverCreator.streamAdapter = rxjsAdapter
    return { driverCreator, dispose: () => { subscription.unsubscribe() } }
  }
}

@autoinject
export class ActionDriverCreator implements DriverCreator {
  makeDriver(context: any, propertyName: string, contextChanges: Subject<ContextChanges>) {
    const actionHandler = new Subject<ContextChanges>()
  
    // ensures that each context will be handles with the proper propertyName 
    let triggerPropertyMap: Map<Subject<any>, string>
    
    if (!context[propertyName]) {
      context[propertyName] = function() {
        const args = Array.from(arguments)
        triggerPropertyMap.forEach((propertyName: string, handler: Subject<any>) => {
          handler.next({ property: propertyName, origin: ChangeOrigin.View, now: args, type: ChangeType.Action })
        })
      }
      triggerPropertyMap = context[propertyName].triggerPropertyMap = new Map<Subject<any>, string>()
    } else {
      triggerPropertyMap = context[propertyName].triggerPropertyMap
    }
    
    let subscription: Subscription
    
    const driverCreator: DriverFunction = (triggers$: Observable<string>) => {
      triggerPropertyMap.set(actionHandler, propertyName)
      
      subscription = triggers$.subscribe(args => {
        triggerPropertyMap.forEach((propertyName: string, handler: Subject<any>) => {
          handler.next({ property: propertyName, origin: ChangeOrigin.ViewModel, now: args, type: ChangeType.Action })
        })
      })

      return actionHandler
        .asObservable()
        .filter(change => change.property === propertyName && change.type === ChangeType.Action)
        .do(next => {
          // trigger also globally, on the context
          contextChanges.next(next)
          // console.log(`context handler:${count}`, propertyName, next)
        })
        .map(change => change.now)
    }
    
    driverCreator.streamAdapter = rxjsAdapter
    
    return {
      driverCreator,
      dispose: () => {
        triggerPropertyMap.delete(actionHandler)
        
        if (subscription)
          subscription.unsubscribe()
      }
    }
  }
}

@autoinject
export class ViewModelDriverCreator implements DriverCreator {
  // TODO: support nested
  
  makeDriver(context: any, propertyName: string, contextChanges: Subject<ContextChanges>) {
    let subscription: Subscription
    const driverCreator: DriverFunction = () => {
      if (context[propertyName] instanceof Object) {
        const subject = new Subject<ContextChanges>()
        const item = context[propertyName]
        if (!item.changes$) {
          item.changes$ = new Subject<ContextChanges>()
        }
        const subscription = item.changes$.subscribe(change => {
          const next = { property: change.property, parentProperty: propertyName, origin: change.origin, now: change.now, type: change.type } 
          subject.next(next)
          contextChanges.next(next)
        })
        return subject.asObservable()
      }
      else
        return Observable.empty()
    }
    
    driverCreator.streamAdapter = rxjsAdapter
    
    return {
      driverCreator,
      dispose: () => {
        if (subscription)
          subscription.unsubscribe()
      }
    }
  }
}

@autoinject
export class CollectionDriverCreator implements DriverCreator {
  makeDriver(context: any, propertyName: string, contextChanges: Subject<ContextChanges>) {
    // TODO: make it a TwoWay driver by the use of the observerLocator
    // TODO: add 'setFilter'; array map of the original indexes
    
    /*
    const strategy = strategyLocator.getStrategy(value)
    const aureliaCollectionObserver = strategy.getCollectionObserver(observerLocator, value) //as ModifyCollectionObserver
    console.log('collection', value, strategy, aureliaCollectionObserver);
    let { driverCreator, dispose } = makeContextPropertyCollectionDriver(aureliaCollectionObserver, triggerContextChange)
    if (!strategy || strategy instanceof NullRepeatStrategy) {
    // non-repeatable
    */
    
    if (!context[propertyName] || !(context[propertyName] instanceof Array))
      context[propertyName] = []
    const array = context[propertyName]

    const allInternalChanges$ = new Subject<CollectionChanges<{}>>()
    const subscriptionMap = new WeakMap<any, Subscription>()
    const subscriptions = new Set<Subscription>()
    
    let subscription: Subscription
    
    const driverCreator: DriverFunction = (collectionChanges$: Subject<CollectionChange<{}>>) => {
      subscription = collectionChanges$.subscribe(collectionChange => {
        switch (collectionChange.action) {
          case 'add':
            if (array.indexOf(collectionChange.item) >= 0) return

            array.push(collectionChange.item)
            
            if (collectionChange.item instanceof Object) { // && typeof collectionChange.item['cycle'] === 'function') {
              if (!collectionChange.item.changes$) {
                collectionChange.item.changes$ = new Subject<ContextChanges>()
              }
              const subscription = collectionChange.item.changes$.subscribe(change => {
                const internalNext = { item: collectionChange.item, property: change.property, origin: change.origin, now: change.now, type: change.type } 
                allInternalChanges$.next(internalNext)
                const next = { item: collectionChange.item, property: propertyName, innerProperty: change.property, origin: change.origin, now: change.now, type: change.type } 
                contextChanges.next(next) // TODO: !
              })
              subscriptionMap.set(
                collectionChange.item, 
                subscription
              )
              subscriptions.add(subscription)
            }
          break
          
          case 'remove':
            const index = array.indexOf(collectionChange.item)
            if (index < 0) return
            
            if (collectionChange.item instanceof Object) {
              function _postUnbindHook() {
                // console.log('unsubscribing post-unbind')
                const subscription = subscriptionMap.get(collectionChange.item)
                if (subscription) {
                  subscription.unsubscribe()
                  subscriptions.delete(subscription)
                }
              }
              collectionChange.item['_postUnbindHooks'] = collectionChange.item['_postUnbindHooks'] || []
              collectionChange.item['_postUnbindHooks'].push(_postUnbindHook)
            }
            
            array.splice(index, 1)
          break
          
          case 'do':
            let actOn = array
            if (collectionChange.where) {
              actOn = array.filter(collectionChange.where)
            }
            actOn.forEach(collectionChange.do)
          break
          
          default:
          break
        }
        
        if (collectionChange.action === 'add' || collectionChange.action === 'remove') {
          allInternalChanges$.next({ 
            item: collectionChange.item, 
            property: null, 
            origin: ChangeOrigin.ViewModel, 
            now: null, 
            type: collectionChange.action === 'add' ? ChangeType.Add : ChangeType.Remove 
          })
        }
      })
      return allInternalChanges$.asObservable()
      
      /**
       * mass trigger - always trigger callables of a certain name
       * i.e.
       * title, completed =>
       * context.changes$.next({ property, name, origin })
       */
    }
    driverCreator.streamAdapter = rxjsAdapter
    
    return { 
      driverCreator, 
      dispose: () => {
        if (subscription)
          subscription.unsubscribe()
        subscriptions.forEach(subscription => subscription.unsubscribe())
      }
    }
  }
}

// decorators:
export function oneWay(definition, propertyName) {
  defineDriverCreator(definition.constructor, propertyName, OneWayDriverCreator)
}

export function twoWay(definition, propertyName) {
  defineDriverCreator(definition.constructor, propertyName, TwoWayDriverCreator)
}

export function action(definition, propertyName) {
  defineDriverCreator(definition.constructor, propertyName, ActionDriverCreator)
}

export function collection(definition, propertyName) {
  defineDriverCreator(definition.constructor, propertyName, CollectionDriverCreator)
}

export function signal(definition, propertyName) {
  defineDriverCreator(definition.constructor, propertyName, SignalDriverCreator)
}

export function viewModel(definition, propertyName) {
  defineDriverCreator(definition.constructor, propertyName, ViewModelDriverCreator)
}
