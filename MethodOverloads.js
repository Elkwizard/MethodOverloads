const Overload = (function (_this) {
	// bind
	for (let key in _this) _this[key] = _this[key].bind(_this);
	
	// symbols 
	_this._symbols = {
		type: Symbol("type"),
		typedFunc: Symbol("typedFunc")
	};

	_this._precomputedTypes = new Map();
	
	// default types
	_this.types = {
		number: _this.type("number"),
		float: _this.type("number"),
		ufloat: _this.defineType(a => typeof a === "number" && a > 0),
		int: _this.defineType(a => typeof a === "number" && a === Math.floor(a)),
		uint: _this.defineType(a => typeof a === "number" && a >= 0 && a === Math.floor(a)),
		byte: _this.defineType(a => typeof a === "number" && a >= 0 && a <= 255 && a === Math.floor(a)),
		string: _this.type("string"),
		stringLine: _this.defineType(a => typeof a === "string" && a.split(/\n|\r/g).length === 1),
		boolean: _this.type("boolean"),
		undef: _this.type("undefined"),
		symbol: _this.type("symbol"),
		func: _this.type(Function),
		any: _this._type(() => true)
	};

	_this.computedTypes = {
		funcArgs: (...types) => _this.defineType(a => _this.overloadExists(a, ...types)),
		funcArgs2: (...typeLists) => _this.defineType(a => {
			for (let i = 0; i < typeLists.length; i++) if (!_this.overloadExists(a, ...typeLists[i])) return false;
			return true;
		}),
		floatRange: (min, max) => _this.defineType(a => typeof a === "number" && a >= min && a <= max),
		intRange: (min, max) => _this.defineType(a => typeof a === "number" && a >= min && a <= max && a === Math.floor(a)),	
		stringLength: len => _this.defineType(a => typeof a === "string" && a.length === len),
		stringPattern: regex => _this.defineType(a => typeof a === "string" && regex.test(a)) 
	};

	//assign
	return _this;
})({
	defineType(fn) {
		return this._type(fn);
	},
	type(typeTok) {
		let type = null;
		if (this._isType(typeTok)) return typeTok;
		if (this._precomputedTypes.has(typeTok)) return this._precomputedTypes.get(typeTok);
		else if (Array.isArray(typeTok)) {
			// n dim arrays
			type = this._arrayRecurse(typeTok);
		} else if (typeof typeTok === "object") {
			//object / interface
			let typeChecks = {};
			for (let key in typeTok) typeChecks[key] = this.type(typeTok[key]);
			type = arg => {
				if (arg === undefined) return false;
				for (let key in typeChecks) if (!typeChecks[key](arg[key])) return false;
				return true;
			};
		} else if (typeof typeTok === "string" || typeTok === null || typeTok === undefined) {
			//primitive
			if (typeTok === "null") return arg => arg === null;
			type = arg => typeof arg === typeTok;
		} else if (typeof typeTok === "function") {
			//object / class
			type = arg => !!arg && typeof arg === "object" && "constructor" in arg && arg instanceof typeTok;
		}
		if (type !== null) {
			type = this._type(type);
			this._precomputedTypes.set(typeTok, type);
			return type;
		}
		throw new SyntaxError("Invalid type syntax.");
	},
	optional(type) {
		type = this.type(type);
		return this._type(arg => arg === undefined || type(arg));
	},
	not(type) {
		return this._type(v => !type(v));
	},
	or(...types) {
		for (let i = 0; i < types.length; i++) types[i] = this.type(types[i]);
		return this._type(arg => {
			for (let i = 0; i < types.length; i++)
				if (types[i](arg)) return true;
			return false;
		});
	},
	and(...types) {
		for (let i = 0; i < types.length; i++) types[i] = this.type(types[i]);
		return this._type(arg => {
			for (let i = 0; i < types.length; i++)
				if (!types[i](arg)) return false;
			return true;
		});
	},
	method(...overloads) {
		if (!overloads.length) throw new RangeError(`No overloads provided for method '${name}'.`);

		for (let i = 0; i < overloads.length; i++) {
			let types = overloads[i].types;
			for (let j = 0; j < types.length; j++) types[j] = this.type(types[j]);
		}

		let lengthGroups = [];
		let lengths = [];
		for (let i = 0; i < overloads.length; i++) {
			let n = overloads[i];
			let nl = n.types.length;
			if (!(nl in lengthGroups)) {
				lengthGroups[nl] = [];
				lengths.push(nl);
			}
			lengthGroups[nl].push(n);
		}

		lengths.sort((a, b) => a - b);
		let validLengthsStr = (lengths.length === 1) ? `${lengths[0]} argument${(lengths[0] === 1) ? " is" : "s are"}` : `${lengths.slice(0, lengths.length - 1).join(", ")} or ${lengths[lengths.length - 1]} arguments are`;

		const fn = function () {
			let amtArgs = arguments.length;
			if (amtArgs in lengthGroups) {
				let group = lengthGroups[amtArgs];
				groupLoop: for (let i = 0; i < group.length; i++) {
					let overload = group[i];
					for (let j = 0; j < amtArgs; j++)
						if (!overload.types[j](arguments[j])) continue groupLoop;
					return overload.method(...arguments);
				}
				throw new TypeError(`Invalid argument types for function.`);
			} else throw new RangeError(`Invalid number of arguments for function. ${arguments.length} argument${(arguments.length === 1) ? "" : "s"} provided, but ${validLengthsStr} necessary.`);
		};

		fn._overloads = overloads;
		fn._isOverloadedFunction = this._symbols.typedFunc;

		return fn;
	},
	overloadExists(fn, ...types) {
		if (!this._isOverloaded(fn)) return false;

		let overloads = fn._overloads;
		overloadLoop: for (let i = 0; i < overloads.length; i++) {
			let o = overloads[i].types;
			if (o.length !== types.length) continue;
			for (let j = 0; j < o.length; j++) 
				if (o[j] !== types[j]) continue overloadLoop;
			return true;
		}
		return false;
	},
	_arrayRecurse(typeTok, dim = 0) {
		if (Array.isArray(typeTok)) return this._arrayRecurse(typeTok[0], dim + 1);
		let type = this.type(typeTok);
		const arrayType = (arg, dim) => {
			if (!Array.isArray(arg)) return false;
			if (dim === 1) {
				for (let i = 0; i < arg.length; i++) if (!type(arg[i])) return false;
			} else for (let i = 0; i < arg.length; i++) if (!arrayType(arg[i], dim - 1)) return false;
			return true;
		};
		return arg => arrayType(arg, dim);
	},
	_isOverloaded(fn) {
		return fn && fn._isOverloadedFunction === this._symbols.typedFunc;
	},
	_isType(fn) {
		return fn && fn._isOverloadType === this._symbols.type;
	},
	_type(type) {
		type._isOverloadType = this._symbols.type;
		return type;
	}
});