'use strict';

const macro = {
	abort: Symbol( 'abort' ),
	defer: Symbol( 'defer' ),
	owner: Symbol( 'owner' ),
};

class Context {
	constructor( procedure, owner, initData ) {
		Object.assign( this, initData );
		Reflect.defineProperty( this, 'owner', { value: owner } );
		Reflect.defineProperty( this, 'internal', {
			value: {
				defer: null,
				status: 0,
				cursor: 0,
				complete: null,
				procedure: procedure,
				references: {},
			},
			enumerable: true,
		} );
		this.comment = procedure.name;
	}
	start( complete ) {
		setImmediate( () => {
			if ( this.internal.status === 0 ) {
				this.internal.status = 1;
				this.internal.complete = complete;
				this.inform();
			}
		} );
	}
	close( complete ) {
		switch ( this.internal.status ) {
		case 0:
			this.internal.status = 3;
			return true;
		case 1:
			this.internal.complete = complete;
			this.inform( null, macro.abort );
			return false;
		case 2:
			this.internal.complete = complete;
			return false;
		case 3:
		case 4:
			return true;
		}
	}
	inform() {
		setImmediate( () => this.resolve( ...arguments ) );
	}
	informGenerate( sender ) {
		return ( ...args ) => {
			if ( sender ) {
				sender[ macro.owner ] && sender[ macro.owner ].context.inform( ...arguments, ...args );
			} else {
				this.inform( ...arguments, ...args );
			}
		};
	}
	resolve( sender, name, ...args ) {
		while ( this.internal.status === 1 ) {
			if ( this.internal.cursor >= this.internal.procedure.markpoints.abort ) {
				this.internal.status = 2;
				this.reference();
				setImmediate( () => {
					this.internal.status = 3;
					this.internal.complete && this.internal.complete();
				} );
				break;
			}
			let expr = this.internal.procedure[ this.internal.cursor ];
			let returnValue = null;
			try {
				if ( typeof expr === 'string' ) {
					this.comment = expr;
				} else if ( typeof expr === 'function' ) {
					returnValue = expr.call( this );
				} else if ( typeof expr === 'object' ) {
					if ( expr[ name ] ) {
						returnValue = expr[ name ].call( this, sender, ...args );
					} else if ( this.internal.procedure.interrupts[ name ] ) {
						try {
							returnValue = this.internal.procedure.interrupts[ name ].call( this, sender, ...args );
							if ( returnValue == null ) {
								break;
							}
						} catch ( error ) {
							this.owner.errors.push( error );
							break;
						}
					} else if ( expr[ macro.defer ] && this.internal.defer === null ) {
						this.internal.defer = setTimeout( () => {
							this.internal.defer = null;
							this.resolve( null, expr[ macro.defer ].name );
						}, expr[ macro.defer ].number );
						break;
					} else {
						break;
					}
				}
			} catch ( error ) {
				returnValue = this.internal.cursor < this.internal.procedure.markpoints.exit ? '@exit' : '@abort';
				this.owner.errors.push( error );
			}
			name = undefined;
			if ( this.internal.defer ) {
				clearTimeout( this.internal.defer );
				this.internal.defer = null;
			}
			if ( typeof returnValue === 'string' ) {
				returnValue = returnValue.split( '@' );
				const markpoint = returnValue[ 1 ];
				switch ( markpoint ) {
				case 'error':
					this.internal.status = 4;
					this.reference();
					continue;
				case 'continue':
					continue;
				default:
					const cursor = this.internal.procedure.markpoints[ markpoint ];
					if ( typeof cursor === 'number' ) {
						this.internal.cursor = cursor;
					} else {
						this.owner.errors.push( new Error( 'undefined markpoint "' + markpoint + '"' ) );
						this.internal.cursor = this.internal.procedure.markpoints.abort;
					}
					continue;
				}
			}
			this.internal.cursor++;
		}
	}
	reference( nameOrReference, reference, release ) {
		switch ( arguments.length ) {
		case 0:
			Reflect.ownKeys( this.internal.references ).forEach( ( name ) => this.reference( name ) );
			break;
		case 1:
			if ( reference = this.internal.references[ nameOrReference ] || nameOrReference ) {
				const owner = reference[ macro.owner ];
				if ( owner && owner.context === this && owner.context.internal.references[ owner.name ] === reference ) {
					owner.release && owner.release( reference );
					delete reference[ macro.owner ];
					delete owner.context.internal.references[ owner.name ];
				}
			}
			break;
		default:
			this.reference( nameOrReference );
			const owner = reference[ macro.owner ];
			if ( owner && owner.context.internal.references[ owner.name ] === reference ) {
				delete owner.context.internal.references[ owner.name ];
			}
			reference[ macro.owner ] = {
				name: nameOrReference,
				context: this,
				release: release || owner && owner.release,
			};
			this.internal.references[ nameOrReference ] = reference;
			break;
		}
	}
};

class Procedure extends Array {
	constructor( name ) {
		super();
		this.compile( [ '.name', name ] );
	}
	create( owner, initData ) {
		return new Context( this, owner, initData );
	}
	compile( codeSource ) {
		this.length = 0;
		this.visible = true;
		this.interrupts = {};
		this.markpoints = {
			exit: Infinity,
		};
		for ( let cursor = 0; cursor < codeSource.length; cursor++ ) {
			let expr = codeSource[ cursor ];
			if ( typeof expr === 'function' ) {
				this.push( expr );
			}
			if ( typeof expr === 'number' ) {
				expr += '';
			}
			if ( typeof expr === 'string' ) {
				if ( expr.startsWith( '.' ) ) {
					const attrValue = codeSource[ ++cursor ];
					switch ( expr ) {
					case '.name':
						this.name = attrValue;
						break;
					case '.visible':
						this.visible = attrValue;
						break;
					case '.interrupts':
						this.interrupts = expr = attrValue;
						break;
					default:
						break;
					}
				} else if ( expr.startsWith( '@' ) ) {
					this.push( () => expr );
				} else if ( expr.endsWith( ':' ) ) {
					this.markpoints[ expr.slice( 0, -1 ) ] = this.length;
				} else if ( expr.startsWith( '[' ) && expr.endsWith( ']' ) ) {
					this.push( expr.slice( 1, -1 ) );
				} else {
					expr = {
						[ expr ]: () => {},
					};
				}
			}
			if ( typeof expr === 'object' ) {
				for ( let name in expr ) {
					if ( typeof expr[ name ] === 'string' ) {
						const returnValue = expr[ name ];
						expr[ name ] = () => returnValue;
					}
					if ( name.includes( '|' ) ) {
						const execute = expr[ name ];
						name.split( '|' ).forEach( ( name ) => expr[ name ] = execute );
						delete expr[ name ];
					}
				}
				for ( let name in expr ) {
					if ( name % 1 === 0 ) {
						const unique = Symbol( name );
						expr[ unique ] = expr[ name ];
						expr[ name ] = false;
						expr[ macro.defer ] = {
							name: unique,
							number: Number.parseInt( name ),
						};
					}
				}
				this.interrupts !== expr && this.push( expr );
			}
		}
		this.markpoints.abort = this.length;
		this.markpoints.exit = Math.min( this.markpoints.abort, this.markpoints.exit );
		this.interrupts[ macro.abort ] = function() {
			return this.internal.cursor < this.internal.procedure.markpoints.exit ? '@exit' : null;
		};
	}
};

class Worker {
	constructor( id ) {
		Reflect.defineProperty( this, 'id', { value: id, enumerable: true } );
		Reflect.defineProperty( this, 'errors', { value: [], enumerable: true } );
		Reflect.defineProperty( this, 'contexts', { value: {}, enumerable: true } );
	}
	inform() {
		setImmediate( () => {
			for ( let name in this.contexts ) {
				this.contexts[ name ].resolve( ...arguments );
			}
		} );
	}
	informGenerate( sender ) {
		return ( ...args ) => {
			if ( sender ) {
				sender[ macro.owner ] && sender[ macro.owner ].context.owner.inform( ...arguments, ...args );
			} else {
				this.inform( ...arguments, ...args );
			}
		};
	}
	comment() {
		let comments = [];
		for ( let name in this.contexts ) {
			const context = this.contexts[ name ];
			if ( context.internal.procedure.visible === true ) {
				comments.push( context.comment );
			}
		}
		this.errors.length && comments.push( '<' + this.errors.length + '>' );
		return comments.join( ';' );
	}
	procedure( id, name, initData ) {
		if ( arguments.length === 0 ) {
			for ( let id in this.contexts ) {
				this.procedure( id );
			}
		} else if ( arguments.length === 1 ) {
			const context = this.contexts[ id ];
			if ( context && context.close( () => this.procedure( id ) ) ) {
				delete this.contexts[ id ];
			}
		} else {
			const procedure = this.constructor.procedures[ name ];
			if ( procedure ) {
				if ( id == null ) {
					id = procedure.name;
				}
				const context = this.contexts[ id ];
				if ( context && context.close( () => this.procedure( id, name, initData ) ) === false ) {
					;
				} else {
					const newContext = procedure.create( this, initData );
					this.contexts[ id ] = newContext;
					newContext.start( () => this.procedure( id ) );
				}
			}
		}
	}
};

const studio = module.exports = {
	container: {},
	worker: function( className, id, initData ) {
		if ( arguments.length === 0 ) {
			for ( let className in this.container ) {
				studio.worker( className );
			}
		} else {
			const metaClass = this.container[ className ];
			if ( metaClass ) {
				switch ( arguments.length ) {
				case 1:
					for ( let id in metaClass.workers ) {
						studio.worker( className, id );
					}
					break;
				case 2:
					if ( metaClass.workers[ id ] ) {
						metaClass.workers[ id ].procedure();
						delete metaClass.workers[ id ];
					}
					break;
				default:
					let worker = metaClass.workers[ id ];
					if ( worker == null ) {
						worker = metaClass.workers[ id ] = new metaClass( id );
						worker.procedure( null, 'CORE', {} );
					}
					Object.assign( worker, initData );
					return worker;
				}
			}
		}
	},
	require: function( className, dirname ) {
		let metaClass = studio.container[ className ];
		if ( metaClass == null ) {
			Object.assign( studio.container, { [ className ]: class extends Worker {} } );
			metaClass = studio.container[ className ];
			metaClass.draft = {};
			metaClass.workers = {};
			metaClass.procedures = {};
			metaClass.shareObject = {};
		}
		let require = new module.constructor( dirname, null );
		require.load( require.id );
		metaClass.draft = require.exports.draft;
		for ( let name in require.exports.procedures ) {
			if ( metaClass.procedures[ name ] == null ) {
				metaClass.procedures[ name ] = new Procedure( name );
			}
			metaClass.procedures[ name ].compile( require.exports.procedures[ name ] );
		}
		Object.assign( metaClass.prototype, require.exports.owner, {
			shareObject: metaClass.shareObject,
		} );
		return metaClass;
	},
};
