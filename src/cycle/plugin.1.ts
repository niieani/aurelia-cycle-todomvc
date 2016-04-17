import {View} from 'aurelia-templating'
import {Observable, Observer, Subscription, BehaviorSubject, ReplaySubject, Subject, Subscriber} from 'rxjs/Rx'

import Cycle from '@cycle/rxjs-run' // /lib/index
import rxjsAdapter from '@cycle/rxjs-adapter' // /lib/index
import { DriverFunction } from '@cycle/base'
import {LogManager, FrameworkConfiguration, declarePropertyDependencies, computedFrom, autoinject} from 'aurelia-framework';
import {BindingSignaler} from 'aurelia-templating-resources'

import {ViewEngineHooks} from 'aurelia-templating'

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
  static Added = 'added'
  static Removed = 'removed'
  static Bind = 'bind'
  static Unbind = 'unbind'
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
  action: 'added' | 'removed';
  item: T & { changes$: Observable<ContextChanges> };
}

export type CycleValue<T> = Observable<T> & { now?: T };

export type ValueAndOrigin<T> = {now: T, origin: ChangeOrigin}

export type Collection<T> = Subject<CollectionChanges<T>> & { now: Array<T> }

export interface CycleDriverContext {
  changes$: Subject<ContextChanges>;
}

export function makeBindingDrivers(context: any, observerLocator: ObserverLocator, strategyLocator: RepeatStrategyLocator) {
  const drivers = {}
  // const observables = {}
  const observables = new Set<any>()
  
  // mega-observable with all everything happening on the context
  let changes$: Subject<ContextChanges> = context.changes$ || new Subject<ContextChanges>()
  changes$['_bindingType'] = BindingType.Context
  // TODO: use a defined Symbol instead of a property name
  // TODO: add bind hooks and remove post bind so that we can have multiple View instances of the same ViewModel
  /*
  context._onBindHook = function() {
    changes$.next({ 
      property: null, 
      origin: ChangeOrigin.ViewModel, 
      now: null, 
      type: ChangeType.Bind
    })
  }
  context._onUnbindHook = function() {
    changes$.next({ 
      property: null, 
      origin: ChangeOrigin.ViewModel, 
      now: null, 
      type: ChangeType.Unbind
    })
    if (typeof this._postUnbindHook === 'function')
      this._postUnbindHook()
  }
  */
  
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
    if (typeof this._postUnbindHook === 'function')
      this._postUnbindHook()
  }).bind(context)
  
  const disposeMethods = new Set<Function>()
  
  if (context.constructor.cycleActions) {
    context.cycleActionsHandler$ = context.cycleActionsHandler$ || new Subject<ContextChanges>()
    const actions = context.constructor.cycleActions as Array<string>
    
    actions
      .map(propertyName => `${propertyName}$`)
      .filter(propertyName => !context[propertyName])
      .forEach(propertyName => {
        context[propertyName] = function() {
          const next = { property: propertyName, origin: ChangeOrigin.View, now: Array.from(arguments), type: ChangeType.Action }
          context.cycleActionsHandler$.next(next)
          
          changes$.next(next)
        }
        drivers[propertyName] = makeContextActionDriver(propertyName, context.cycleActionsHandler$, changes$)
      })
  }
  
  if (context.constructor.cycleOneWay) {
    context.cycleOneWayHandler$ = context.cycleOneWayHandler$ || new Subject<ContextChanges>()
    const oneWay = context.constructor.cycleOneWay as Array<string>
    
    oneWay
      .map(propertyName => `${propertyName}$`)
      .forEach(propertyName => {
        const triggerContextChange = (change: BindingChange<any>) => 
          changes$.next({ property: propertyName, now: change.now, origin: change.origin, type: change.type })

        const aureliaObserver = observerLocator.getObserver(context, propertyName)
        drivers[propertyName] = makeContextSetterDriver(context, propertyName, triggerContextChange)
      })
  }
  
  if (context.constructor.cycleTwoWay) {
    context.cycleTwoWayHandler$ = context.cycleTwoWayHandler$ || new Subject<ContextChanges>()
    const twoWay = context.constructor.cycleTwoWay as Array<string>
    
    twoWay
      .map(propertyName => `${propertyName}$`)
      .forEach(propertyName => {
        const triggerContextChange = (change: BindingChange<any>) => 
          changes$.next({ property: propertyName, now: change.now, origin: change.origin, type: change.type })

        // const value = drivers[propertyName]
        // const strategy = strategyLocator.getStrategy(value)
        // if (!strategy || strategy instanceof NullRepeatStrategy) {
        // non-repeatable
        const aureliaObserver = observerLocator.getObserver(context, propertyName)
        let { driverCreator, dispose } = makeContextPropertyDriver(aureliaObserver, triggerContextChange)
        drivers[propertyName] = driverCreator
        disposeMethods.add(dispose)
      })
  }
  
  // Object.keys(context)
  //   // .filter(propName => typeof context[propName].subscribe === 'function')
  //   .forEach(propName => {
  //     const triggerContextChange = (change: BindingChange<any>) => 
  //         changes$.next({ property: propName, now: change.now, origin: change.origin, type: change.type })

  //     if (context[propName] instanceof Observable) {
  //       const observable = context[propName] as BehaviorSubject<any> & { _bindingType; _now }
        
  //       observable['_contextChangesTrigger'] = triggerContextChange
        
  //       /*
  //       if (observable instanceof BehaviorSubject) {
  //         // emit initial value
  //         const currentValue = observable.getValue()
  //         const change = Object.assign({}, currentValue, { origin: ChangeOrigin.InitialValue })
  //         if (currentValue !== undefined)
  //           observable['_contextChangesTrigger'](change)
  //         // const tempSub = observable.subscribe(change => observable['_contextChangesTrigger'](change))
  //       }
  //       */
        
  //       observables.add(observable)
  //       // observables[propName] = observable
        
  //       switch (observable._bindingType) {
  //         case BindingType.Action:
  //           // enhanceSubjectWithAureliaAction(observable)
  //           drivers[propName] = makeActionBindingDriver(observable) //makeOneWayBindingDriver(observable)
  //           break
  //         case BindingType.Collection:
  //           drivers[propName] = makeCollectionBindingDriver(observable)
  //           break
  //         case BindingType.Context:
  //           drivers[propName] = makeContextDriver(observable)
  //           break
  //         case undefined:
  //           enhanceSubjectWithAureliaValue(observable)
  //           // NOTE: fallthrough intentional!
  //         default:
  //           drivers[propName] = typeof observable.next === 'function' ? 
  //                 makeTwoWayBindingDriver(observable) : makeOneWayBindingDriver(observable)
  //       }
  //     } else {
  //       const value = drivers[propName]
  //       const strategy = strategyLocator.getStrategy(value)
  //       // if (!strategy || strategy instanceof NullRepeatStrategy) {
  //         // non-repeatable
  //         const aureliaObserver = observerLocator.getObserver(context, propName)
  //         let { driverCreator, dispose } = makeContextPropertyDriver(aureliaObserver, triggerContextChange)
  //         drivers[`${propName}$`] = driverCreator
  //         disposeMethods.add(dispose)
  //       // } else {
  //       //   console.log('strategy', strategy)
  //       //   const aureliaCollectionObserver = strategy.getCollectionObserver(observerLocator, value) //as ModifyCollectionObserver
  //       //   let { driverCreator, dispose } = makeContextPropertyCollectionDriver(aureliaCollectionObserver, triggerContextChange)
  //       //   drivers[`${propName}$`] = driverCreator
  //       //   disposeMethods.add(dispose)          
  //       // }
  //       // if (drivers[propName] instanceof Array)
  //       // drivers[propName] = make
  //     }
  //   }
  //   // TODO: add setter drivers on non-observable properties
  //   // use the observer from Aurelia to convert the values to Observables
  // )
  if (!context.changes$) {
    context.changes$ = changes$
  }
  return { //observables, 
    drivers, onBind: () => {
      observables.forEach(observable => {
        if (typeof observable._bind === 'function')
          observable._bind()
      })
      onBind()
    }, onUnbind: () => {
      observables.forEach(observable => {
        if (typeof observable._bind === 'function')
          observable._unbind()
      })
      disposeMethods.forEach(d => d())
    }
  }
}

export function makeContextActionDriver(propertyName: string, contextActionsHandler: Subject<ContextChanges>, contextHandler: Subject<ContextChanges>) {
  const driverCreator: DriverFunction = function aureliaDriver(triggers$: Observable<string>) {
    triggers$.subscribe(args => {
      const next = { property: propertyName, now: args, origin: ChangeOrigin.ViewModel, type: ChangeType.Action }
      contextActionsHandler.next(next)
      contextHandler.next(next)
    })

    return contextActionsHandler
      .filter(change => change.property === propertyName)
      // .filter(change => change !== undefined && change.origin === ChangeOrigin.View)
      .map(change => change.now)
  }
  driverCreator.streamAdapter = rxjsAdapter
  return driverCreator
}

export function makeContextSetterDriver(context, propertyName: string, triggerContextChange: ((change: BindingChange<any>) => void)) {
  const driverCreator: DriverFunction = function aureliaDriver(value$: Observable<string>) {
    value$.subscribe(newValueFromContext => {
      if (newValueFromContext !== context[propertyName]) {
        context[propertyName] = newValueFromContext
        const next = { now: newValueFromContext, origin: ChangeOrigin.ViewModel, type: ChangeType.Value }
        triggerContextChange(next)
      }
    })
  }
  
  driverCreator.streamAdapter = rxjsAdapter
  return driverCreator
}

export function makeContextPropertyDriver(aureliaObserver: InternalPropertyObserver, triggerContextChange: ((change: BindingChange<any>) => void)) {
  const observable = new BehaviorSubject<any>(aureliaObserver.getValue())
  
  const callable = (newValue, oldValue) => {
    observable.next(newValue)
    const next = { now: newValue, origin: ChangeOrigin.Unknown, type: ChangeType.Value }
    triggerContextChange(next)
  }
  
  aureliaObserver.subscribe(callable)
  
  const driverCreator: DriverFunction = function aureliaDriver(value$: Observable<string>) {
    value$.subscribe(newValueFromContext => {
      if (newValueFromContext !== aureliaObserver.getValue()) {
        aureliaObserver.setValue(newValueFromContext)
      }
    })
    
    return observable
  }
  
  driverCreator.streamAdapter = rxjsAdapter
  return { driverCreator, dispose: () => aureliaObserver.unsubscribe(callable) }
}

export function makeContextPropertyCollectionDriver(aureliaObserver: InternalPropertyObserver & {items}, triggerContextChange: ((change: BindingChange<any>) => void)) {
  const allInternalChanges$ = new Subject<CollectionChanges<{}>>()
  const subscriptionMap = new WeakMap<any, Subscription>()
  const subscriptions = new Set<Subscription>()
  
  const driverCreator: DriverFunction = function collectionDriver(collectionChanges$: Subject<CollectionChange<{}>>) {
    // const array = new Array()
    const array = aureliaObserver.items
    
    collectionChanges$.subscribe(collectionChange => {
      // console.log('collection change', collectionChange)
      if (collectionChange.action == 'added') {
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
      }
      else {
        const index = array.indexOf(collectionChange.item)
        if (array.indexOf(collectionChange.item) < 0) return
        
        if (collectionChange.item instanceof Object) { 
          collectionChange.item['_postUnbindHook'] = () => {
            // console.log('unsubscribing post-unbind')
            const subscription = subscriptionMap.get(collectionChange.item)
            if (subscription) {
              subscription.unsubscribe()
              subscriptions.delete(subscription)
            }
          }
        }
        
        array.splice(array.indexOf(collectionChange.item), 1)
      }
      
      allInternalChanges$.next({ 
        item: collectionChange.item, 
        property: null, 
        origin: ChangeOrigin.ViewModel, 
        now: null, 
        type: collectionChange.action === 'added' ? ChangeType.Added : ChangeType.Removed 
      })
    })
    return allInternalChanges$
    
    /**
     * mass trigger - always trigger callables of a certain name
     * i.e.
     * title, completed =>
     * context.changes$.next({ property, name, origin })
     */
  }
  driverCreator.streamAdapter = rxjsAdapter
  return { driverCreator, dispose: () => subscriptions.forEach(subscription => subscription.unsubscribe()) }
}

export function makeTwoWayBindingDriver(bindingObservable: BehaviorSubject<any> & { _now?: any }) {
  const driverCreator: DriverFunction = function aureliaDriver(value$: Observable<string>) {
    value$.subscribe(newValueFromContext => {
      if (newValueFromContext !== bindingObservable._now) {
        const next = { now: newValueFromContext, origin: ChangeOrigin.ViewModel, type: ChangeType.Value }
        bindingObservable.next(next)
      
        if (bindingObservable['_contextChangesTrigger'])
          bindingObservable['_contextChangesTrigger'](next)
      }
    })

    return bindingObservable
      .filter(change => change !== undefined)
      // .filter(change => change !== undefined && change.origin === ChangeOrigin.View)
      .map(change => change.now)
  }
  driverCreator.streamAdapter = rxjsAdapter
  return driverCreator
}

export function makeActionBindingDriver(bindingObservable: Subject<any>) {
  const driverCreator: DriverFunction = function aureliaDriver(triggers$: Observable<string>) {
    triggers$.subscribe(args => {
      const next = { now: args, origin: ChangeOrigin.ViewModel, type: ChangeType.Action }
      // const next = { now: newValueFromContext, origin: ChangeOrigin.ViewModel, type: ChangeType.Value }
      bindingObservable.next(next)
    
      if (bindingObservable['_contextChangesTrigger'])
        bindingObservable['_contextChangesTrigger'](next)
    })

    return bindingObservable
      .filter(change => change !== undefined)
      // .filter(change => change !== undefined && change.origin === ChangeOrigin.View)
      .map(change => change.now)
  }
  driverCreator.streamAdapter = rxjsAdapter
  return driverCreator
}

export function makeContextDriver(contextObservable: Subject<ContextChanges>) {
  const driverCreator: DriverFunction = function aureliaDriver() {
    // return {
    //   property(property: string) {
    //     return contextObservable.filter(change => change.property === property)
    //   },
    // }
    return contextObservable.asObservable()
  }
  driverCreator.streamAdapter = rxjsAdapter
  return driverCreator
}

export function makeOneWayBindingDriver(bindingObservable: Observable<any> & { _now?: any }) {
  const driverCreator: DriverFunction = function aureliaDriver() {
    return bindingObservable
      .filter(change => change !== undefined)
      // .filter(change => change !== undefined && change.origin === ChangeOrigin.View)
      .map(change => change.now)
  }
  driverCreator.streamAdapter = rxjsAdapter
  return driverCreator
}

export function makeCollectionBindingDriver(collectionObservable: Observable<CollectionChange<{}>> & { now?: Array<any> }) {
  const driverCreator: DriverFunction = function collectionDriver(collectionChanges$: Subject<CollectionChange<{}>>) {
    const allInternalChanges$ = new Subject<CollectionChanges<{}>>()
    const contextChangeTrigger = collectionObservable['_contextChangesTrigger']
    const subscriptionMap = new WeakMap<any, Subscription>()
    // const array = new Array()
    const array = collectionObservable.now
    const subscriptions = new Set<Subscription>()
    collectionObservable['_collectionSubscriptions'] = subscriptions
    
    collectionChanges$.subscribe(collectionChange => {
      // console.log('collection change', collectionChange)
      if (collectionChange.action == 'added') {
        if (array.indexOf(collectionChange.item) >= 0) return

        array.push(collectionChange.item)
        
        if (collectionChange.item instanceof Object) { 
          if (!collectionChange.item.changes$) {
            collectionChange.item.changes$ = new Subject<ContextChanges>()
          }
          const subscription = collectionChange.item.changes$.subscribe(change => {
            const next = { item: collectionChange.item, property: change.property, origin: change.origin, now: change.now, type: change.type } 
            allInternalChanges$.next(next)
            if (contextChangeTrigger) {
              contextChangeTrigger(next)
            }
          })
          subscriptionMap.set(
            collectionChange.item, 
            subscription
          )
          subscriptions.add(subscription)
        }
      }
      else {
        const index = array.indexOf(collectionChange.item)
        if (array.indexOf(collectionChange.item) < 0) return
        
        if (collectionChange.item instanceof Object) { 
          collectionChange.item['_postUnbindHook'] = () => {
            // console.log('unsubscribing post-unbind')
            const subscription = subscriptionMap.get(collectionChange.item)
            if (subscription) {
              subscription.unsubscribe()
              subscriptions.delete(subscription)
            }
          }
        }
        
        array.splice(array.indexOf(collectionChange.item), 1)
      }
      
      allInternalChanges$.next({ 
        item: collectionChange.item, 
        property: null, 
        origin: ChangeOrigin.ViewModel, 
        now: null, 
        type: collectionChange.action === 'added' ? ChangeType.Added : ChangeType.Removed 
      })
    })
    return allInternalChanges$
    
    /**
     * mass trigger - always trigger callables of a certain name
     * i.e.
     * title, completed =>
     * context.changes$.next({ property, name, origin })
     */
  }
  driverCreator.streamAdapter = rxjsAdapter
  return driverCreator
}
/*
export function action() {
  const subject = new Subject<Array<any>>()
  enhanceSubjectWithAureliaAction(subject)
  return subject
}

export function enhanceSubjectWithAureliaAction(subject) {//: Subject<Array<any>>) {
  if (subject['_bindingType'] !== undefined) return
  
  const invokeMethod = function() {
    const next = { origin: ChangeOrigin.View, now: Array.from(arguments), type: ChangeType.Action }
    subject.next(next)
    
    if (subject['_contextChangesTrigger'])
      subject['_contextChangesTrigger'](next)
    // subject.next(Array.from(arguments))
  }
  
  Object.defineProperty(subject, 'action', {
    get: function() {
      return invokeMethod.bind(this)
    },
    enumerable: true,
    configurable: true
  })
  
  subject['_bindingType'] = BindingType.Action
}
*/
export function value<T>(initialValue?: T) {
  const next = { now: initialValue, origin: ChangeOrigin.View, type: ChangeType.Value }
  let subject: any = initialValue === undefined ? new ReplaySubject<any>(1) : new BehaviorSubject<any>(next)
  enhanceSubjectWithAureliaValue(subject)
  subject._now = initialValue
  // if (initialValue !== undefined) {
  //   subject.next(value)
  //   // subject = subject.startWith(value)
    
  //   // if (subject['_contextChangesTrigger'])
  //   //   subject['_contextChangesTrigger'](value)
      
  //   // else
  //   //   subject['_replyForContext'] = value
  //   // subject.next(initialValue)
  // }
  
  // we're cheating a bit with types
  return subject as CycleValue<T>
}

function enhanceSubjectWithAureliaValue<T>(subject: BehaviorSubject<ValueAndOrigin<T>>, initialValue?: T) {
  if (subject['_bindingType'] !== undefined) return

  subject['_bind'] = function() {
    this._aureliaSubscriptionCount = (this._aureliaSubscriptionCount || 0) + 1
    if (!this._aureliaSubscription)
      this._aureliaSubscription = this.subscribe(change => {
        // this._now = change.now
        
        if (change !== undefined && this._now !== change.now && !(change.origin === ChangeOrigin.View && change.now === undefined)) {
          this._now = change.now
          // console.log('change', change, this)
          // if (change.now instanceof Object) {
          // }
        }
        
        // if (this['_contextChangesTrigger']) {
        //   this['_contextChangesTrigger'](change)
        // }
      })
  }
  
  subject['_unbind'] = function() {
    this._aureliaSubscriptionCount = (this._aureliaSubscriptionCount || 0) - 1
    if (this._aureliaSubscriptionCount === 0) {    
      this._aureliaSubscription.unsubscribe()
      this._aureliaSubscription = undefined
    }
  }
  
  const getter = function() {
    // console.log('getting value', this)
    return this._now
  } as (() => any) & { dependencies: Array<string> }
  getter.dependencies = ['_now']

  if (typeof subject.next === 'function')
    Object.defineProperty(subject, 'now', {
      get: getter.bind(subject),
      set: function(newValue) {
        if (newValue !== this._now) {
          const next = { now: newValue, origin: ChangeOrigin.View, type: ChangeType.Value }
          this.next(next)
          
          if (this['_contextChangesTrigger'])
            this['_contextChangesTrigger'](next)
        }
      },
      enumerable: true,
      configurable: true
    })
  else
    Object.defineProperty(subject, 'now', {
      get: getter.bind(subject),
      enumerable: true,
      configurable: true
    })
    
  subject['_bindingType'] = BindingType.Value
}

export function collection<T>() {
  const subject = new Subject() as Collection<T>
  subject.now = new Array()
  subject['_bindingType'] = BindingType.Collection
  subject['_unbind'] = function() {
    const subscriptions = (this._collectionSubscriptions as Set<Subscription>)
    if (subscriptions) {
      subscriptions.forEach(subscription => subscription.unsubscribe())
      subscriptions.clear()
    }
  }
  return subject
}

/**
 * dummy value converter that allows to synchronize
 * retriggering of a binding to changes of other values
 */
export class TriggerValueConverter {
  toView(source) {
    return source
  }
}

// decorators:
export function action(definition, propertyName) {
  if (!definition.constructor.cycleActions) {
    definition.constructor.cycleActions = [propertyName]
  } else {
    definition.constructor.cycleActions.push(propertyName)
  }
  // console.log('action decorator', definition, propertyName)
}

export function twoWay(definition, propertyName) {
  if (!definition.constructor.cycleTwoWay) {
    definition.constructor.cycleTwoWay = [propertyName]
  } else {
    definition.constructor.cycleTwoWay.push(propertyName)
  }
  // console.log('action decorator', definition, propertyName)
}

export function oneWay(definition, propertyName) {
  if (!definition.constructor.cycleOneWay) {
    definition.constructor.cycleOneWay = [propertyName]
  } else {
    definition.constructor.cycleOneWay.push(propertyName)
  }
  // console.log('action decorator', definition, propertyName)
}

export function configure(frameworkConfig: FrameworkConfiguration) {
  const viewResources = frameworkConfig.aurelia.resources
  const valueConverterInstance = frameworkConfig.container.get(TriggerValueConverter)
  viewResources.registerValueConverter('trigger', valueConverterInstance)
  
  const strategyLocator = frameworkConfig.container.get(RepeatStrategyLocator) as RepeatStrategyLocator
  const observerLocator = frameworkConfig.container.get(ObserverLocator) as ObserverLocator
  
  const hooks = {
    beforeBind: function (view: View & {bindingContext}) {
      const context = view.bindingContext
      if (!context || typeof context.cycle !== 'function') return
      // console.log('before bind', view)
      
      // TODO add count
      
      const sources = context.cycleDrivers || {}
      const { drivers, onBind, onUnbind } = makeBindingDrivers(context, observerLocator, strategyLocator)
      
      // bind all observables
      // Object.getOwnPropertyNames(observables)
      //   .forEach(propName => {
      //     if (typeof observables[propName]._bind === 'function')
      //       observables[propName]._bind()
      //   })
      
      // context._cycleContextObservables = observables
      onBind()
      
      Object.assign(sources, drivers)
      
      const disposeFunction = Cycle.run(context.cycle.bind(context), sources)
      
      context._cycleDispose = () => {
        disposeFunction()
        onUnbind()
      }
      
      // if (typeof context._onBindHook === 'function')
      //   context._onBindHook()
    },
    beforeUnbind: function (view: View & {bindingContext}) {
      const context = view.bindingContext
      if (!context || typeof context._cycleDispose !== 'function') return
      context._cycleDispose()
      
      // if (!context || typeof context.cycle !== 'function') return
      
      // const observables = context._cycleContextObservables
      // Object.getOwnPropertyNames(observables)
      //   .forEach(propName => {
      //     const observable = observables[propName]
          
      //     /*
      //     if (observable['_contextChangesTrigger'] && observable instanceof BehaviorSubject) {
      //       const change = Object.assign({ origin: ChangeOrigin.InitialValue })
      //       observable['_contextChangesTrigger'](change)
      //     }
      //     */
          
      //     if (typeof observable._unbind === 'function')
      //       observable._unbind()
      //   })
      
      // context._cycleDispose()
      
      // if (typeof context._onUnbindHook === 'function')
      //   context._onUnbindHook()      
    }
  } as ViewEngineHooks
  
  viewResources.registerViewEngineHooks(hooks)
}
