<script context="module">
	export async function preload(page, session) {
		const { server64 } = page.params;
		
    const res = await this.fetch(`${server64}.json`);
		const data = await res.json();
    
		if (res.status === 200) {
			return { ...data };
		} else {
			this.error(res.status, data.message);
		}
	}
</script>

<script>
	import { onMount } from "svelte";
	import { moonscriptTemplate, luaTemplate } from "./_lunar-templates";

	export let moonscriptSegments;
	export let assets;
	
	const sceneObjectTemplate = {
		x: 0,
		y: 0
	}
	let refSceneObjects = [];
	let spriteTypeRefs = {};
	let soundObjects = {};
	
	onMount(async () => {
		// Events
		document.addEventListener("spawn", (e) => {
			const sceneObject = {
				...e.detail,
				...sceneObjectTemplate,			
			}
			
			// Check for any "__press_" properties
			const checkPress = "__press_";
			const pressProperties = Object.keys(sceneObject).filter((key) => key.startsWith(checkPress));
			const keys = pressProperties.map((property) => property.split(checkPress)[1]);
			
			// Set variables accordingly
			window.HAS_PRESS = pressProperties.length > 0;
			window.KEYS = keys
			window.ID = sceneObject.id;
			
			// Call Lua-side
			window.add_keys();
			
			// Add to refs
			refSceneObjects.push(sceneObject);
			
			if (window._create) {
				window._create(sceneObject);
			}
		});
	
		document.addEventListener("destroy", (e) => {
			const index = e.detail.id - 1;
			const sceneObject = refSceneObjects[index];
			
			// Ref scene objects
			const lastSceneObject = refSceneObjects.pop();
			
			if (refSceneObjects.length) {
				lastSceneObject.id = e.detail.id;
				refSceneObjects[index] = lastSceneObject;
			}
			
			// Window scene objects
			const lastWindowSceneObject = window.SCENE.pop();
			
			if (lastWindowSceneObject.length) {
				lastWindowSceneObject.id = e.detail.id;
				window.SCENE[index] = lastWindowSceneObject;
			}
			
			// Destroy
			if (sceneObject._img) {
				sceneObject._img.destroy();
			}
			
			if (sceneObject._text) {
				sceneObject._text.destroy();
			}
		});

		// Lua
		const moonscriptCreate = moonscriptTemplate(moonscriptSegments).trim();
		
		const luaSegments = {
			create: await window.MoonScript.compile(moonscriptCreate),
			update: await window.MoonScript.compile(moonscriptSegments.update)
		}
		
		const returnPattern = /^return/gm;
		luaSegments.create = luaSegments.create.replaceAll(returnPattern, "");
		luaSegments.update = luaSegments.update.replaceAll(returnPattern, "");
		
		const lua = luaTemplate(luaSegments);
		
		// // DEBUG
		// console.log(lua);
		
		window.fengari.load(lua)();
		
		// Phaser
		const Matter = Phaser.Physics.Matter.Matter;
		
		const _isKinematic = (sceneObject) => {
			const { _collide_name = "" } = sceneObject;
			return _collide_name.startsWith("KINEMATIC");
		}
			
		const _collideUsesPointer = (sceneObject) => {
			const { _collide_name = "" } = sceneObject;
			return _collide_name.endsWith("POINTER");
		}
		
		const _overlapUsesPointer = (sceneObject) => {
			const { _overlap_name = "" } = sceneObject;
			return _overlap_name.endsWith("POINTER");
		}
		
		function preload() {
			for (let asset of assets) {
				const name = asset.name.toLowerCase();
				const { url } = asset;
				
				if (asset.animations.length) {
					const { frameWidth, frameHeight } = asset;
					this.load.spritesheet(name, url, { frameWidth, frameHeight });
				}
				else if (asset.type === "sound") {
					this.load.audio(name, [url]);
				}
				else {
					this.load.image(name, url);
				}
			}
		}
		
		function create() {
			// Draw config
			window.graphics = this.add.graphics();
			
			// Physics config
			this.matter.world.autoUpdate = false;
			this.matter.world.setBounds();
			this.matter.add.pointerConstraint({ length: 1, stiffness: 0.6 });
			
			// Assets config
			for (let asset of assets) {
				const name = asset.name.toLowerCase();
				const { animations, frameRate, type } = asset;
				
				// Animations
				spriteTypeRefs[name] = animations.length ? "sprite" : "image";
				
				for (let animation of animations) {
					const [key] = Object.keys(animation);
					const frames = animation[key];
					const lastFrame = frames.pop();
					let repeat = 1;
					
					if (typeof lastFrame === "string" && lastFrame.toLowerCase() === "loop") {
						repeat = -1;
					}
					else {
						frames.push(lastFrame);
					}
					
					this.anims.create({
						key,
						frames: this.anims.generateFrameNumbers(name, { frames }),
						frameRate,
						repeat
					})
				}
				
				// Sounds
				if (type === "sound") {
					const sound = this.sound.add(name);
					soundObjects[name] = sound;
				}
			}
			
			// Global scene object config
			window._create = (sceneObject) => {
				const { x, y, angle, _class_name, id } = sceneObject;
				const name = _class_name.toLowerCase();
				
				let isKinematic = _isKinematic(sceneObject);
				let isStatic = sceneObject._collide_name === "STATIC" || isKinematic;
				
				const ignorePointer = !_collideUsesPointer(sceneObject) && !_overlapUsesPointer(sceneObject);
				const isSensor = !!sceneObject._overlap_name;
				
				const index = id - 1;
				
				// Text
				if (sceneObject._is_text) {
					const { content, font, size, color } = sceneObject;
					
					// Convert 0x00... into "#00..."
					const baseHexColor = color.toString(16);
					let padZeros = "";
					
					for (let i = 0; i < 6 - baseHexColor.length; i++) {
						padZeros += "0";
					}
					
					const hexColor = "#" + padZeros + baseHexColor;
					
					let text = this.add.text(x, y, content, { fontFamily: font, fontSize: size, fill: hexColor });
					
					if (sceneObject._collide_name) {
						let matterText =
							this.matter.add.gameObject(text, { isSensor, ignorePointer })
							.setStatic(isStatic)
							.setIgnoreGravity(isSensor || isKinematic)
							.setAngle(angle);
						
						// if (isKinematic) {
						// 	Matter.Body.setInertia(matterText.body, Infinity);
						// }
							
						refSceneObjects[index]._text = matterText;
					}
					else {
						refSceneObjects[index]._text = text;
					}
				}
				else if (sceneObject._is_timer) {
					const { rate, count } = sceneObject;
					const event = {
						delay: rate,
						callbackScope: this,
						callback: () => {
							sceneObject.fire();
						}
					}
					
					if (count > 0) {
						event.repeat = count - 1;
					}
					else {
						event.loop = true
					}
					
					this.time.addEvent(event);
				}
				// Images
				else {
					const spriteType = spriteTypeRefs[name];
					
					// TODO: Add scale
					let img = this.matter.add[spriteType](x, y, name, null, {
						ignorePointer,
						isSensor
					}).setAngle(angle);
					
					// Tweak img
					if (img.texture.key === "__MISSING") {
						img.destroy();
						img = null;
					}
					else {
						img.setStatic(isStatic);
						img.setIgnoreGravity(isSensor || isKinematic || !sceneObject._collide_name);
						
						// if (isKinematic) {
						// 	Matter.Body.setInertia(img.body, Infinity);
						// }
					}
					
					refSceneObjects[index]._img = img;
				}
				
				// Set misc "private" variables
				if (sceneObject._has_hover) {
					refSceneObjects[index]._hover = false;
					sceneObject._pointer_down = false;
				}
			}
			
			// Scene objects
			window.SCENE.forEach((sceneObject) => {
				window._create(sceneObject);
			});
			
			// Physics events
			this.matter.world.on("collisionstart", (event, body1, body2) => {
				// Colliding bodies
				let collideRefs = refSceneObjects.filter((sceneObject) => sceneObject._collide_name);
				let collideObject1 = collideRefs.find((sceneObject) => (sceneObject._img || sceneObject._text).body === body1);
				let collideObject2 = collideRefs.find((sceneObject) => (sceneObject._img || sceneObject._text).body === body2);
				
				if (collideObject1.id && collideObject2.id) {
					window.COLLIDE_ID1 = collideObject1.id;
					window.COLLIDE_ID2 = collideObject2.id;
					window.run_collide();
				}
				
				// Overlapping bodies
				let overlapRefs = refSceneObjects.filter((sceneObject) => sceneObject._overlap_name);
				let overlapObject1 = overlapRefs.find((sceneObject) => (sceneObject._img || sceneObject._text).body === body1);
				let overlapObject2 = overlapRefs.find((sceneObject) => (sceneObject._img || sceneObject._text).body === body2);
				
				if (overlapObject1.id && overlapObject2.id) {
					window.OVERLAP_ID1 = overlapObject1.id;
					window.OVERLAP_ID2 = overlapObject2.id;
					window.run_overlap();
				}
			});
			
			// Keyboard events
			document.addEventListener("keydown", (e) => {
				if (e.repeat) return;
				
				const key = e.key.trim() ? e.key.toUpperCase() : e.code.toUpperCase();
				
				window.KEY = key;
				window.run_press();
			});
			
			document.addEventListener("keyup", (e) => {
				if (e.repeat) return;
				
				const key = e.key.toUpperCase();
				
				window.KEY = key;
				window.run_unpress();
			})
			
			// Pointer events
			window.POINTER_OBJECTS = {};

			// TODO: Fix hover and click Lua-side
			this.input.on("pointermove", (pointer) => {
				const { worldX, worldY } = pointer;
				
				// Hover
				const hoverObjects = refSceneObjects.filter((sceneObject) => sceneObject._has_hover && (sceneObject._img || sceneObject._text));
				
				hoverObjects.forEach((sceneObject) => {
					const obj = (sceneObject._img || sceneObject._text);
					const isPointerOver = this.matter.containsPoint(obj.body, worldX, worldY);
					
					if (isPointerOver) {
						const hasHover = !!window.POINTER_OBJECTS[sceneObject.id];
						
						if (!hasHover) {
							window.POINTER_OBJECTS[sceneObject.id] = sceneObject;
							window.ID = sceneObject.id;
							window.run_hover();
						}
					}
					else if (window.POINTER_OBJECTS[sceneObject.id]) {
						sceneObject._pointer_down = false;
						
						window.ID = sceneObject.id;
						window.run_unhover();
						
						if (sceneObject._has_unclick) {
							window.run_unclick();
						}
						
						delete window.POINTER_OBJECTS[sceneObject.id];
					}
				});
				
				// Kinematic pointers
				const kinematicPointerObjects = refSceneObjects.filter((sceneObject) => sceneObject._pointer_down && sceneObject._collide_name === "KINEMATIC_POINTER");
				
				kinematicPointerObjects.forEach((sceneObject) => {
					const obj = (sceneObject._img || sceneObject._text);
					obj.setStatic(false);
				})
			})
			
			this.input.on("pointerdown", (pointer) => {
				const { worldX, worldY } = pointer;
				const clickObjects = refSceneObjects.filter((sceneObject) => sceneObject._has_click || sceneObject._collide_name === "KINEMATIC_POINTER");
				
				clickObjects.forEach((sceneObject) => {
					const { body } = (sceneObject._img || sceneObject._text);
					
					if (this.matter.containsPoint(body, worldX, worldY)) {
						sceneObject._pointer_down = true;
						
						window.ID = sceneObject.id;
						window.run_click();
					}
				})
			});
			
			this.input.on("pointerup", (pointer) => {
				const { worldX, worldY } = pointer;
				const clickObjects = refSceneObjects.filter((sceneObject) => sceneObject._has_click);
				
				clickObjects.forEach((sceneObject) => {
					const { body } = (sceneObject._img || sceneObject._text);
					
					if (this.matter.containsPoint(body, worldX, worldY)) {						
						window.ID = sceneObject.id;
						window.run_unclick();
					}
				})
				
				// Kinematic pointers
				const kinematicPointerObjects = refSceneObjects.filter((sceneObject) => sceneObject._pointer_down && sceneObject._collide_name === "KINEMATIC_POINTER");
				
				kinematicPointerObjects.forEach((sceneObject) => {
					sceneObject._pointer_down = false;
					
					const obj = (sceneObject._img || sceneObject._text);
					obj.setStatic(true);
				})
			});
			
			// Sprite lunar functions
			window.mirrorSprite = () => {
				const index = window.MIRROR_ID - 1;
				const sceneObject = refSceneObjects[index];
				
				if (sceneObject._img) {
					sceneObject._img.flipX = window.MIRROR_X
				}
			}
			
			window.flipSprite = () => {
				const index = window.FLIP_ID - 1;
				const sceneObject = refSceneObjects[index];
				
				if (sceneObject._img) {
					sceneObject._img.flipY = window.FLIP_Y
				}
			}
			
			window.animateSprite = () => {
				const index = window.ANIMATE_ID - 1;
				const sceneObject = refSceneObjects[index];
				
				if (sceneObject._img && sceneObject._img.anims) {
					sceneObject._img.anims.play(window.ANIMATE_NAME);
				}
			}
			
			window.unanimateSprite = () => {
				const index = window.UNANIMATE_ID - 1;
				const sceneObject = refSceneObjects[index];
				
				if (sceneObject._img && sceneObject._img.anims) {
					// sceneObject._img.anims.stop();
					sceneObject._img.anims.pause();
					sceneObject._img.anims.setProgress(0);
				}
			}
			
			// Physics lunar functions
			window.applyThrust = () => {
				const index = window.THRUST_ID - 1;
				const sceneObject = refSceneObjects[index];
				
				if (sceneObject._img) {
					const direction = 
						window.THRUST_DIRECTION === "Up" ? "Left" :
						window.THRUST_DIRECTION === "Down" ? "Right" :
						window.THRUST_DIRECTION === "Left" ? "Back" :
						window.THRUST_DIRECTION === "Right" ? "" : null;
						
					if (direction !== null) {
						const amount = window.THRUST_AMOUNT;
						sceneObject._img[`thrust${direction}`](amount);
					}
				}
			}
			
			// Sound lunar functions
			window.playSound = () => {
				const name = window.SOUND_NAME.toLowerCase();
				this.sound.setVolume(0.25);
				soundObjects[name].play();
			}
			
			window.pauseSound = () => {
				const name = window.SOUND_NAME.toLowerCase();
				soundObjects[name].pause();
			}
			
			window.resumeSound = () => {
				const name = window.SOUND_NAME.toLowerCase();
				this.sound.setVolume(0.25);
				soundObjects[name].resume();
			}
			
			window.stopSound = () => {
				const name = window.SOUND_NAME.toLowerCase();
				soundObjects[name].stop();
			}
			
			// Draw lunar functions
			window.drawLine = () => {
				const {
					x1 = 0,
					y1 = 0,
					x2 = x1,
					y2 = y1,
					thickness = 1,
					color = 0x00aaff,
					opacity = 1,
				} = window.LINE_CONFIG;
				
				graphics.lineStyle(thickness, color, opacity);
				graphics.lineBetween(x1, y1, x2, y2);
			}
			
			window.drawRectangle = () => {
				const {
					x = 0,
					y = 0,
					width = 1,
					height = 1,
					thickness = 1,
					color = 0x00aaff,
					opacity = 1,
					stroke,
				} = window.RECTANGLE_CONFIG;
				
				graphics.lineStyle(thickness, stroke, opacity);
				graphics.fillStyle(color, opacity);
				graphics.fillRect(x, y, width, height);
				
				if (stroke) {
					graphics.strokeRect(x, y, width, height);
				}
			}
			
			window.drawEllipse = () => {
				const {
					x = 0,
					y = 0,
					radius = 1,
					thickness = 1,
					color = 0x00aaff,
					opacity = 1,
					height,
					stroke,
				} = window.ELLIPSE_CONFIG;
				
				graphics.lineStyle(thickness, stroke, opacity);
				graphics.fillStyle(color, opacity);
				
				if (height) {
					graphics.fillEllipse(x, y, radius, height);
					
					if (stroke) {
						graphics.strokeEllipse(x, y, radius, height);
					}
				}
				else {
					graphics.fillCircle(x, y, radius);
					
					if (stroke) {
						graphics.strokeCircle(x, y, radius);
					}
				}
			}
		}
		
		function update(time, delta) {
			// Lua scene objects update 1
			window.game_update();
			
			// JS scene objects position 1
			window.SCENE.forEach((sceneObject, index) => {
				if (sceneObject._collide_name !== "STATIC") {
					const { x, y } = sceneObject;
					const ref = refSceneObjects[index];
					const obj = (ref._img || ref._text);
					
					// const { _img } = refSceneObjects[index];
					
					if (obj) {
						obj.x = x;
						obj.y = y;
					}
				}
			});
			
			// Physics - JS scene objects position 2
			this.matter.world.step(delta);
			
			// Physics - Lua scene objects update 2
			refSceneObjects.forEach((sceneObject) => {
				const obj = (sceneObject._img || sceneObject._text);
				
				if (obj) {
					if (!_isKinematic(sceneObject) || !obj.isStatic()) {
						window._SET_POSITION_ID = sceneObject.id;
						window._SET_POSITION_X = obj.x;
						window._SET_POSITION_Y = obj.y;
						window.set_position();
					}
					
					if (_isKinematic(sceneObject)) {
						obj.setAngularVelocity(0);
					}
				}
			});
			
			// Draw
			graphics.clear();
			
			const drawRefs = refSceneObjects.filter((sceneObject) => sceneObject._has_draw);
			
			drawRefs.forEach((refObject) => {
				window.DRAW_ID = refObject.id;
				window.run_draw();
			});
		}
		
		let gameStitch = {
			// ...window.configStub,
			type: Phaser.AUTO,
			physics: {
				default: "matter"
			},
			scene: {
				preload,
				create,
				update,
			}
		}
		
		window.game = new Phaser.Game(gameStitch);
	})
</script>

<style>
	/* h2 {
		white-space: pre;
	} */
</style>

<svelte:head>
	<script src="/fengari-web.js" type="text/javascript"></script>
	<script src="/phaser.min.js"></script>
	<script src="/moonscript/index.js"></script>
</svelte:head>

<!-- <h1>Hey hey!</h1>
<h2>{moonscriptSegments.create}</h2>
<h1>(You you!)</h1>
<h2>{moonscriptSegments.update}</h2> -->

