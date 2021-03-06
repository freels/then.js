/*global define:false, module:false */

!function (name, definition) {
  if (typeof define == 'function') define(definition)
  else if (typeof module != 'undefined') module.exports = definition()
  else this[name] = definition()
}('then', function() {

  // Exeptions

  function UpdateError() {
    this.message = ".update called multiple times for this Promise."
  }

  UpdateError.prototype = new Error()

  function Timeout(millis) {
    this.isTimeout = true
    this.message = "Timed out after "+ millis +"ms."
  }

  Timeout.prototype = new Error()


  // helpers

  function runCallbacks(p) {
    for (var i = 0; i < p.callbacks.length; i++) {
      p.callbacks[i](p.error, p.value)
    }

    p.callbacks = []
  }

  function isFuture(v) { !!v && v.isFuture }

  function flatUpdate(err, value, dest) {
    if (err || !isFuture(value)) {
      dest.update(err, value)
    } else {
      value.onUpdate(function(e, v) { flatUpdate(e, v, dest) })
    }
  }

  function Promise() {
    this.isDefined = false
    this.isError   = false
    this.value     = null
    this.error     = null
    this.callbacks = []
  }

  Promise.prototype = {
    isFuture: true

  , update: function(err, value) {
      if (!this.updateIfEmpty(err, value)) {
        throw new UpdateError()
      }
    }

  , updateIfEmpty: function(err, value) {
      if (!this.isDefined) {
        this.error = err.message ? err : new Error(err)
        this.value = value
        this.isDefined = true

        runCallbacks(this)

        return true
      } else {
        return false
      }
    }

  , setValue: function(v) { this.update(null, v) }

  , setError: function(e) { this.update(e, null) }

  // Registering callbacks

  , onUpdate: function(f) {
      if (this.isDefined) {
        f(this.error, this.value)
      } else {
        this.callbacks.push(f)
      }

      return this
    }

  , onSuccess: function(f) {
      return this.onUpdate(function(err, value) {
        if (value !== null) f(value)
      })
    }

  , onError: function(f) {
      return this.onUpdate(function(err, value) {
        if (err !== null) f(err)
      })
    }

  // Chained responses

  , respond: function(f) {
      var next = new Promise()

      this.onUpdate(function callback(err, value) {
        try {
          var rv = f(err, value)
          flatUpdate(rv[0], rv[1], next)
        } catch (e) {
          next.setError(e)
        }
      })

      return next
    }

  , then: function(f) {
      return this.respond(function(err, value) {
        if (err) {
          return [err, null]
        } else {
          return [null, f(value)]
        }
      })
    }

  , rescue: function(f) {
      return this.respond(function(err, value) {
        if (err) {
          return [null, f(err)]
        } else {
          return [null, value]
        }
      })
    }

  , ensure: function(f) {
      return this.respond(function(err, value){
        // if an exception is thrown in the ensure block, it will
        // override threading through an existing exception if present.
        f()
        return [err, value]
      })
    }

  , within: function(millis) {
      var next = new Promise()
        , t    = setTimeout(function() { next.updateIfEmpty(new Timeout(millis), null) }, millis)

      this.onUpdate(function(err, value) {
        clearTimeout(t)
        next.updateIfEmpty(err, value)
      })

      return next
    }
  }


  // Module

  function promise(f, thisp) {
    return function() {
      var p = new Promise()
      f.apply(thisp, Array.prototype.concat.call(arguments, p))
      return p
    }
  }

  promise.result = function(err, value) {
    var p = new Promise()
    p.update(err, value)
    return p
  }

  promise.value = function(value) { promise.result(null, value) }

  promise.error = function(err) { promise.result(err, null) }

  promise.done = promise.result(null, null)

  function joinPromises(ps, i) {
    if (ps.length === i) {
      return promise.done
    } else {
      return ps[i].then(function(_) {
        return joinPromises(ps, i + 1)
      })
    }
  }

  promise.join = function(ps) {
    return joinPromises(ps, 0)
  }

  function sequencePromises(ps, rv, i) {
    if (ps.length === i) {
      return promise.value(rv)
    } else {
      return ps[i].then(function(value) {
        rv[i] = value
        return sequencePromises(ps, rv, i + 1)
      })
    }
  }

  promise.sequence = function(ps) {
    return sequencePromises(ps, new Array(ps.length), 0)
  }

  promise.select = function(ps) {
    var mutex = new Promise()
      , p     = new Promise()
      , rest  = ps.slice(0)

    for (var iter = 0; iter < ps.length; iter++) {
      var i = iter

      ps[i].onUpdate(function(err, value) {
        if (mutex.updateIfEmpty(null, true)) {
          if (err) {
            p.setError(err)
          } else {
            rest.splice(i, 1)
            p.setValue([value, rest])
          }
        }
      })
    }

    return p
  }

  return promise
});
