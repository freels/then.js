/*!
  * Then: Flexible, composable, monadic futures for javascript
  * (c) Matt Freels 2012
  * https://github.com/freels/then.js
  * license MIT
  */

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

  function isFuture(v) {
    !!v && v.isFuture
  }

  function flatUpdate(err, value, dest) {
    if (err || !isFuture(value)) {
      dest.update(err, value)
    } else {
      value.onUpdate(function(e, v) { flatUpdate(e, v, dest) })
    }
  }

  function promise() {
    if (arguments.length === 0) {
      return new Promise()
    } else {
      var f    = arguments[0]
        , args = Array.prototype.slice.call(arguments, 1)
        , p    = new Promise()

      f.apply(null, args.concat(p))

      return p
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
        this.error = err
        this.value = value
        this.isDefined = true

        runCallbacks(this)

        return true
      } else {
        return false
      }
    }

  , setValue: function(v) {
      this.update(null, v)
    }

  , setError: function(e) {
      this.update(e, null)
    }

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

  return promise
});
