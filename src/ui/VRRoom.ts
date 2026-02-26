/**
 * VRRoom — иммерсивная 3D комната
 * 
 * Активируется при включении VR режима.
 * Создаёт окружение: стены, пол, потолок, мебель-силуэты, освещение.
 */
import * as THREE from 'three'

// Canvas-текстура для стен
function wallTexture(color: string, gridColor: string, size=512): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width=c.height=size
  const ctx = c.getContext('2d')!
  ctx.fillStyle = color; ctx.fillRect(0,0,size,size)
  ctx.strokeStyle = gridColor; ctx.lineWidth = 1
  const step = size/8
  for (let i=0; i<=size; i+=step) {
    ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,size); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(size,i); ctx.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4,4)
  return t
}

function floorTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width=c.height=512
  const ctx = c.getContext('2d')!
  // Паркетный пол
  for (let row=0; row<8; row++) for (let col=0; col<8; col++) {
    const x=col*64, y=row*64
    ctx.fillStyle = (row+col)%2===0 ? '#1a1208' : '#22180a'
    ctx.fillRect(x,y,64,64)
    ctx.strokeStyle='#0e0a04'; ctx.lineWidth=1.5
    ctx.strokeRect(x+2,y+2,60,60)
    // Волокна дерева
    ctx.strokeStyle='rgba(180,120,50,0.08)'; ctx.lineWidth=1
    for (let g=0; g<4; g++) {
      ctx.beginPath(); ctx.moveTo(x,y+g*16); ctx.lineTo(x+64,y+g*16+10); ctx.stroke()
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(6,6)
  return t
}

export class VRRoom {
  group: THREE.Group
  private lights: THREE.Light[] = []
  private _visible = false

  constructor() {
    this.group = new THREE.Group()
    this.build()
    this.group.visible = false
  }

  private build(): void {
    const W=8, H=3.5, D=10
    const wallMat = new THREE.MeshStandardMaterial({
      map: wallTexture('#0d1520','#1a2840'), roughness:0.9, metalness:0
    })
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTexture(), roughness:0.7, metalness:0.02
    })
    const ceilMat = new THREE.MeshStandardMaterial({
      color:0x080c14, roughness:0.95
    })

    // Стены, пол, потолок
    const parts: [THREE.BoxGeometry, THREE.Material, THREE.Vector3, THREE.Euler][] = [
      [new THREE.BoxGeometry(W,0.1,D),  floorMat, new THREE.Vector3(0,-H/2,0), new THREE.Euler()],
      [new THREE.BoxGeometry(W,0.1,D),  ceilMat,  new THREE.Vector3(0,H/2,0),  new THREE.Euler()],
      [new THREE.BoxGeometry(0.1,H,D),  wallMat,  new THREE.Vector3(-W/2,0,0), new THREE.Euler()],
      [new THREE.BoxGeometry(0.1,H,D),  wallMat,  new THREE.Vector3(W/2,0,0),  new THREE.Euler()],
      [new THREE.BoxGeometry(W,H,0.1),  wallMat,  new THREE.Vector3(0,0,-D/2), new THREE.Euler()],
    ]
    for (const [geo,mat,pos,rot] of parts) {
      const m = new THREE.Mesh(geo, mat)
      m.position.copy(pos); m.rotation.copy(rot)
      m.receiveShadow = true
      this.group.add(m)
    }

    // Окно на задней стене
    const windowGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 1.2),
      new THREE.MeshBasicMaterial({
        color: 0x4488ff, transparent: true, opacity: 0.08
      })
    )
    windowGlow.position.set(0, 0.3, -D/2+0.1)
    this.group.add(windowGlow)

    const windowFrame = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.85,1.25,0.05)),
      new THREE.LineBasicMaterial({color:0x2a3a5c})
    )
    windowFrame.position.set(0, 0.3, -D/2+0.1)
    this.group.add(windowFrame)

    // Стол
    const deskMat = new THREE.MeshStandardMaterial({color:0x1a1208, roughness:0.6})
    const desk = new THREE.Mesh(new THREE.BoxGeometry(2.4,0.06,1.0), deskMat)
    desk.position.set(0,-0.4,-3.5)
    this.group.add(desk)
    // Ножки стола
    for (const [x,z] of [[-1.1,0.45],[1.1,0.45],[-1.1,-0.45],[1.1,-0.45]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.7,0.06),deskMat)
      leg.position.set(x,-0.78,z-3.5)
      this.group.add(leg)
    }

    // Монитор (силуэт)
    const monitorMat = new THREE.MeshStandardMaterial({color:0x0a0f1a,roughness:0.2,metalness:0.6})
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.9,0.55,0.04),monitorMat)
    screen.position.set(0.1, 0.0, -3.6)
    this.group.add(screen)
    const screenGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.85,0.50),
      new THREE.MeshBasicMaterial({color:0x001a40, transparent:true, opacity:0.7})
    )
    screenGlow.position.set(0.1, 0.0, -3.58)
    this.group.add(screenGlow)
    const screenBase = new THREE.Mesh(new THREE.BoxGeometry(0.3,0.04,0.2),monitorMat)
    screenBase.position.set(0.1,-0.31,-3.7)
    this.group.add(screenBase)

    // Полка
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.9,0.04,0.22),deskMat)
    shelf.position.set(-2.8,0.5,-3.0)
    this.group.add(shelf)
    for (let i=0; i<3; i++) {
      const book = new THREE.Mesh(
        new THREE.BoxGeometry(0.06,0.2,0.18),
        new THREE.MeshStandardMaterial({color:[0x1a3a6a,0x1a4a1a,0x4a1a1a][i],roughness:0.8})
      )
      book.position.set(-3.05+i*0.1,0.63,-3.0)
      this.group.add(book)
    }

    // Плинтус (нижний периметр)
    for (const [geo, pos] of [
      [new THREE.BoxGeometry(W,0.12,0.06), new THREE.Vector3(0,-H/2+0.06,-D/2)],
      [new THREE.BoxGeometry(W,0.12,0.06), new THREE.Vector3(0,-H/2+0.06, D/2)],
      [new THREE.BoxGeometry(0.06,0.12,D), new THREE.Vector3(-W/2,-H/2+0.06,0)],
      [new THREE.BoxGeometry(0.06,0.12,D), new THREE.Vector3( W/2,-H/2+0.06,0)],
    ] as [THREE.BoxGeometry, THREE.Vector3][]) {
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({color:0x1c2030,roughness:0.7}))
      m.position.copy(pos); this.group.add(m)
    }

    // ── Освещение ─────────────────────────────────────────────────────────
    const ambient = new THREE.AmbientLight(0x1a2a3f, 1.2); this.group.add(ambient); this.lights.push(ambient)
    const ceil1 = new THREE.PointLight(0xb0c8ff, 1.0, 8)
    ceil1.position.set(0, H/2-0.2, -2); this.group.add(ceil1); this.lights.push(ceil1)
    const ceil2 = new THREE.PointLight(0x8090c0, 0.6, 6)
    ceil2.position.set(0, H/2-0.2, 1); this.group.add(ceil2); this.lights.push(ceil2)
    const monitorLight = new THREE.PointLight(0x003366, 0.8, 3)
    monitorLight.position.set(0.1, 0.0, -3.3); this.group.add(monitorLight); this.lights.push(monitorLight)
    // Rim сбоку
    const rim = new THREE.DirectionalLight(0x4060a0, 0.4)
    rim.position.set(-3, 2, 1); this.group.add(rim); this.lights.push(rim)
  }

  setVisible(v: boolean): void {
    this._visible = v
    this.group.visible = v
  }

  isVisible(): boolean { return this._visible }
  addToScene(s: THREE.Scene): void { s.add(this.group) }
}
