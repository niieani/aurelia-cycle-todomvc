import {Observable, Observer, Subscription, BehaviorSubject, ReplaySubject, Subject, Subscriber} from 'rxjs/Rx'

// import Cycle from './core' // '@cycle/core' // /lib/index
// import rxjsAdapter from '@cycle/rxjs-adapter' // /lib/index
import Cycle from '@cycle/rxjs-run' // /lib/index
import rxjsAdapter from '@cycle/rxjs-adapter' // /lib/index
import { DriverFunction } from '@cycle/base'
import {LogManager, FrameworkConfiguration, declarePropertyDependencies, computedFrom, autoinject} from 'aurelia-framework';
import {BindingSignaler} from 'aurelia-templating-resources'

import {ViewEngineHooks, View, Controller} from 'aurelia-templating'

export {Observable, Observer, Subscription, BehaviorSubject, ReplaySubject, Subject} from 'rxjs/Rx'

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

export function makeBindingDrivers(context: any, observerLocator: ObserverLocator, strategyLocator: RepeatStrategyLocator, signaler: BindingSignaler) {
  const drivers = {}
  
  // mega-observable with everything happening on the context
  let changes$: Subject<ContextChanges> = context.changes$ || new Subject<ContextChanges>()
  changes$['_bindingType'] = BindingType.Context
  // TODO: use a defined Symbol instead of a property name
  // TODO: add bind hooks and remove post bind so that we can have multiple View instances of the same ViewModel
  
  const onBind = (function() {
    changes$.next({ 
      property: null, 
      origin: ChangeOrigin.ViewModel, 
      now: null, 
      type: ChangeType.Bind
    })
  }).bind(context)
  
  const onUnbind = (function() {
    changes$.next({ 
      property: null, 
      origin: ChangeOrigin.ViewModel, 
      now: null, 
      type: ChangeType.Unbind
    })
  }).bind(context)
  
  const dispose = (function() {
    if (this._postUnbindHooks)
      this._postUnbindHooks.forEach(hook => hook())
    this._postUnbindHooks = undefined
  }).bind(context)
  
  const disposeMethods = new Set<Function>()
  
  if (context.constructor.cycleActions) {
    const actions = context.constructor.cycleActions as Array<string>
    
    actions
      .forEach(propertyName => {
        const { driverCreator, dispose } = makeActionBindingDriver(context, propertyName, changes$)
        drivers[`${propertyName}$`] = driverCreator
        disposeMethods.add(dispose)
      })
  }
  
  if (context.constructor.cycleOneWay) {
    const oneWay = context.constructor.cycleOneWay as Array<string>
    
    oneWay
      .forEach(propertyName => {
        const triggerContextChange = (change: BindingChange<any>) => 
          changes$.next({ property: propertyName, now: change.now, origin: change.origin, type: change.type })

        // const aureliaObserver = observerLocator.getObserver(context, propertyName)
        const { driverCreator, dispose } = makeOneWayBindingDriver(context, propertyName, triggerContextChange)
        drivers[`${propertyName}$`] = driverCreator
        disposeMethods.add(dispose)
      })
  }
  
  if (context.constructor.cycleTwoWay) {
    const twoWay = context.constructor.cycleTwoWay as Array<string>
    
    twoWay
      .forEach(propertyName => {
        const triggerContextChange = (change: BindingChange<any>) => 
          changes$.next({ property: propertyName, now: change.now, origin: change.origin, type: change.type })

        let { driverCreator, dispose } = makeTwoWayBindingDriver(context, propertyName, observerLocator, triggerContextChange)
        drivers[`${propertyName}$`] = driverCreator
        disposeMethods.add(dispose)
      })
  }
  
  if (context.constructor.cycleCollections) {
    const collections = context.constructor.cycleCollections as Array<string>
    
    collections
      .forEach(propertyName => {
        const triggerContextChange = (change: BindingChange<any>) => 
          changes$.next({ property: propertyName, now: change.now, origin: change.origin, type: change.type })

        // const aureliaObserver = observerLocator.getObserver(context, propertyName)
        
        if (!context[propertyName] || !(context[propertyName] instanceof Array))
          context[propertyName] = []

        const value = context[propertyName]
        let { driverCreator, dispose } = makeCollectionBindingDriver(value, triggerContextChange)
        drivers[`${propertyName}$`] = driverCreator
        disposeMethods.add(dispose)
      })
  }
  
  if (context.constructor.cycleSignals) {
    const signals = context.constructor.cycleSignals as Array<string>
    
    signals
      .forEach(propertyName => {
        const triggerContextChange = (change: BindingChange<any>) => 
          changes$.next({ property: propertyName, now: change.now, origin: change.origin, type: change.type })

        // const aureliaObserver = observerLocator.getObserver(context, propertyName)
        const { driverCreator, dispose } = makeSignalDriver(context, propertyName, signaler, triggerContextChange)
        drivers[`${propertyName}$`] = driverCreator
        disposeMethods.add(dispose)
      })
  }
  
  if (context.constructor.cycleViewModels) {
    const viewModels = context.constructor.cycleViewModels as Array<string>
    
    viewModels
      .forEach(propertyName => {
        // TODO: support nested
        const triggerContextChange = (change: BindingChange<any>) => 
          changes$.next({ property: propertyName, now: change.now, origin: change.origin, type: change.type })

        const { driverCreator, dispose } = makeViewModelBindingDriver(context, propertyName, triggerContextChange)
        drivers[`${propertyName}$`] = driverCreator
        disposeMethods.add(dispose)
      })
  }
  
  if (!context.changes$) {
    context.changes$ = changes$
  }
  
  return {
    drivers, onBind, onUnbind, dispose: () => {
      disposeMethods.forEach(d => d())
      dispose()
    }
  }
}

export function makeActionBindingDriver(context, propertyName: string, contextHandler: Subject<ContextChanges>) {
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
  
  const dispose = function() {
    triggerPropertyMap.delete(actionHandler)
    
    if (subscription)
      subscription.unsubscribe()
  }
  
  const driverCreator: DriverFunction = function aureliaDriver(triggers$: Observable<string>) {
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
        contextHandler.next(next)
        // console.log(`context handler:${count}`, propertyName, next)
      })
      .map(change => change.now)
  }
  driverCreator.streamAdapter = rxjsAdapter
  return { driverCreator, dispose }
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

export function makeSignalDriver(context, propertyName: string, signaler: BindingSignaler, triggerContextChange: ((change: BindingChange<any>) => void)) {
  const signalName = context[propertyName] || (context[propertyName] = getSignalNameWithUniqueCount(`${context.constructor.name}:${propertyName}`)) //Math.random().toString(36).slice(2)

  let subscription: Subscription
  
  const driverCreator: DriverFunction = function aureliaDriver(value$: Observable<string>) {
    subscription = value$
      .throttleTime(100) // don't signal too often
      .subscribe(newValueFromContext => {
        signaler.signal(signalName)
        // console.log('signalling', signalName)
        const next = { now: signalName, origin: ChangeOrigin.ViewModel, type: ChangeType.Signal }
        triggerContextChange(next)
      })
    return Observable.empty()
  }
  
  driverCreator.streamAdapter = rxjsAdapter
  return { driverCreator, dispose: function() { subscription.unsubscribe() } }
}

export function makeOneWayBindingDriver(context, propertyName: string, triggerContextChange: ((change: BindingChange<any>) => void)) {
  let subscription: Subscription
  const dispose = function() {
    if (subscription)
      subscription.unsubscribe()
  }
  const driverCreator: DriverFunction = function aureliaDriver(value$: Observable<string>) {
    subscription = value$.subscribe(newValueFromContext => {
      if (newValueFromContext !== context[propertyName]) {
        context[propertyName] = newValueFromContext
        const next = { now: newValueFromContext, origin: ChangeOrigin.ViewModel, type: ChangeType.Value }
        triggerContextChange(next)
      }
    })
    return Observable.empty()
  }
  
  driverCreator.streamAdapter = rxjsAdapter
  return { driverCreator, dispose }
}

export function makeViewModelBindingDriver(context, propertyName: string, triggerContextChange: ((change: BindingChange<any>) => void)) {
  let subscription: Subscription
  const dispose = function() {
    if (subscription)
      subscription.unsubscribe()
  }
  const driverCreator: DriverFunction = function aureliaDriver() {
    if (context[propertyName] instanceof Object) {
      const subject = new Subject<ContextChanges>()
      const item = context[propertyName]
      if (!item.changes$) {
        item.changes$ = new Subject<ContextChanges>()
      }
      const subscription = item.changes$.subscribe(change => {
        const next = { property: change.property, parentProperty: propertyName, origin: change.origin, now: change.now, type: change.type } 
        subject.next(next)
        if (triggerContextChange) {
          triggerContextChange(next)
        }
      })
      return subject.asObservable()
    }
    else
      return Observable.empty()
  }
  
  driverCreator.streamAdapter = rxjsAdapter
  return { driverCreator, dispose }
}

export function makeTwoWayBindingDriver(context, propertyName: string, observerLocator: ObserverLocator, triggerContextChange: ((change: BindingChange<any>) => void)) {
  // const value = drivers[propertyName]
  // const strategy = strategyLocator.getStrategy(value)
  // if (!strategy || strategy instanceof NullRepeatStrategy) {
  // non-repeatable
  const aureliaObserver = observerLocator.getObserver(context, propertyName)
  
  const subject = new BehaviorSubject<any>(aureliaObserver.getValue())
  
  const callable = (newValue, oldValue) => {
    subject.next(newValue)
    const next = { now: newValue, origin: ChangeOrigin.Unknown, type: ChangeType.Value }
    triggerContextChange(next)
  }
  
  aureliaObserver.subscribe(callable)
  
  let subscription: Subscription
  
  function dispose() {
    aureliaObserver.unsubscribe(callable)
    if (subscription)
      subscription.unsubscribe()
  }
  
  const driverCreator: DriverFunction = function aureliaDriver(value$: Observable<string>) {
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
  return { driverCreator, dispose }
}

export function makeCollectionBindingDriver(array: Array<any>, triggerContextChange: ((change: BindingChange<any>) => void)) {
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
  
  const allInternalChanges$ = new Subject<CollectionChanges<{}>>()
  const subscriptionMap = new WeakMap<any, Subscription>()
  const subscriptions = new Set<Subscription>()
  
  let subscription: Subscription
  
  const driverCreator: DriverFunction = function collectionDriver(collectionChanges$: Subject<CollectionChange<{}>>) {
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
              const next = { item: collectionChange.item, property: change.property, origin: change.origin, now: change.now, type: change.type } 
              allInternalChanges$.next(next)
              if (triggerContextChange) {
                triggerContextChange(next)
              }
            })
            subscriptionMap.set(
              collectionChange.item, 
              subscription
            )
            subscriptions.add(subscription)
          }
        break;
        
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
        break;
        
        case 'do':
          let actOn = array
          if (collectionChange.where) {
            actOn = array.filter(collectionChange.where)
          }
          actOn.forEach(collectionChange.do)
        break;
        
        default:
        break;
      }
      
      allInternalChanges$.next({ 
        item: collectionChange.item, 
        property: null, 
        origin: ChangeOrigin.ViewModel, 
        now: null, 
        type: collectionChange.action === 'add' ? ChangeType.Add : ChangeType.Remove 
      })
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

// decorators:
export function action(definition, propertyName) {
  if (!definition.constructor.cycleActions) {
    definition.constructor.cycleActions = [propertyName]
  } else {
    definition.constructor.cycleActions.push(propertyName)
  }
}

export function twoWay(definition, propertyName) {
  if (!definition.constructor.cycleTwoWay) {
    definition.constructor.cycleTwoWay = [propertyName]
  } else {
    definition.constructor.cycleTwoWay.push(propertyName)
  }
}

export function oneWay(definition, propertyName) {
  if (!definition.constructor.cycleOneWay) {
    definition.constructor.cycleOneWay = [propertyName]
  } else {
    definition.constructor.cycleOneWay.push(propertyName)
  }
}

export function collection(definition, propertyName) {
  if (!definition.constructor.cycleCollections) {
    definition.constructor.cycleCollections = [propertyName]
  } else {
    definition.constructor.cycleCollections.push(propertyName)
  }
}

export function signal(definition, propertyName) {
  if (!definition.constructor.cycleSignals) {
    definition.constructor.cycleSignals = [propertyName]
  } else {
    definition.constructor.cycleSignals.push(propertyName)
  }
}

export function viewModel(definition, propertyName) {
  if (!definition.constructor.cycleViewModels) {
    definition.constructor.cycleViewModels = [propertyName]
  } else {
    definition.constructor.cycleViewModels.push(propertyName)
  }
}

export function configure(frameworkConfig: FrameworkConfiguration) {
  const viewResources = frameworkConfig.aurelia.resources
  
  const strategyLocator = frameworkConfig.container.get(RepeatStrategyLocator) as RepeatStrategyLocator
  const observerLocator = frameworkConfig.container.get(ObserverLocator) as ObserverLocator
  const signaler = frameworkConfig.container.get(BindingSignaler) as BindingSignaler
  
  const hooks = {
    beforeBind: function (view: View & {bindingContext; controller: Controller}) {
      if (view.controller !== null) {
        const context = view.controller.viewModel as any
        
        if (!context || typeof context.cycle !== 'function') return
        const count = context._cycleCount = (context._cycleCount || 0) + 1   
        // console.log('awesome bind', count)
    
        if (context._cycleCount > 1) {       
          return
        }
    
        const preparedSources = context.cycleDrivers || {}
        const { drivers, onBind, onUnbind, dispose } = makeBindingDrivers(context, observerLocator, strategyLocator, signaler)
        
        Object.assign(preparedSources, drivers)
        
        onBind()
        
        context._cycleOnUnbind = onUnbind
        
        const {run, sources, sinks} = Cycle(context.cycle.bind(context), preparedSources)
        const disposeFunction = run()
        
        const _cycleDispose = () => {
          dispose()
          disposeFunction()
        }
    
        context._cycleDispose = _cycleDispose
      }
      
    },
    beforeUnbind: function (view: View & {bindingContext: any; controller: Controller}) {
      // const context = this.viewModel
      if (view.controller !== null) {
        const context = view.controller.viewModel as any
        
        if (!context || typeof context._cycleDispose !== 'function') return
        // console.log('awesome unbind', context._cycleCount)
        
        context._cycleCount = context._cycleCount - 1
        
        context._cycleDispose()
        context._cycleOnUnbind()
        context._cycleDispose = undefined
        context._cycleOnUnbind = undefined
      }
    }
  } as ViewEngineHooks
  
  viewResources.registerViewEngineHooks(hooks)
}
