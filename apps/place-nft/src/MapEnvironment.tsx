import {useEffect, useRef} from 'react'
import {
    ACESFilmicToneMapping,
    CapsuleGeometry,
    CircleGeometry,
    Color,
    DirectionalLight,
    Fog,
    GridHelper,
    Group,
    HemisphereLight,
    type Material,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    OctahedronGeometry,
    PerspectiveCamera,
    PlaneGeometry,
    Scene,
    SRGBColorSpace,
    SphereGeometry,
    TorusGeometry,
    WebGLRenderer,
} from 'three'
import './MapEnvironment.css'

export default function MapEnvironment() {
    const canvasRef = useRef<HTMLCanvasElement | null>(null)

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) {
            return
        }

        let renderer: WebGLRenderer
        try {
            renderer = new WebGLRenderer({
                canvas,
                antialias: true,
                powerPreference: 'high-performance',
            })
        } catch {
            canvas.hidden = true
            return
        }

        renderer.outputColorSpace = SRGBColorSpace
        renderer.toneMapping = ACESFilmicToneMapping
        renderer.toneMappingExposure = 1.08

        const scene = new Scene()
        scene.background = new Color(0xf8f9fd)
        scene.fog = new Fog(0xf8f9fd, 12, 28)

        const camera = new PerspectiveCamera(32, 1, 0.1, 50)
        camera.position.set(0, 0.8, 13)
        camera.lookAt(0, 0, 0)

        scene.add(new HemisphereLight(0xffffff, 0xdce4f4, 2.6))
        const keyLight = new DirectionalLight(0xffffff, 3.2)
        keyLight.position.set(-4, 8, 7)
        scene.add(keyLight)

        const floor = new Mesh(
            new PlaneGeometry(42, 32),
            new MeshStandardMaterial({color: 0xf1f4fa, roughness: 0.94}),
        )
        floor.rotation.x = -Math.PI / 2
        floor.position.set(0, -2.85, -1)
        scene.add(floor)

        const grid = new GridHelper(42, 42, 0xcbd4e4, 0xdfe5ef)
        grid.position.y = -2.82
        const gridMaterial = grid.material as Material
        gridMaterial.transparent = true
        gridMaterial.opacity = 0.2
        scene.add(grid)

        const backdrop = new Mesh(
            new CircleGeometry(4.7, 64),
            new MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.72,
                depthWrite: false,
            }),
        )
        backdrop.position.set(0, 0.45, -4.5)
        scene.add(backdrop)

        const decor = new Group()
        scene.add(decor)

        const lavenderMaterial = new MeshStandardMaterial({
            color: 0xbab7ff,
            roughness: 0.42,
            metalness: 0.02,
        })
        const blueMaterial = new MeshStandardMaterial({
            color: 0x9fdff5,
            roughness: 0.38,
            metalness: 0.02,
        })
        const warmMaterial = new MeshStandardMaterial({
            color: 0xffdca8,
            roughness: 0.5,
            metalness: 0,
        })
        const mintMaterial = new MeshStandardMaterial({
            color: 0xb9eadb,
            roughness: 0.44,
            metalness: 0,
        })

        const sphere = new Mesh(new SphereGeometry(0.92, 32, 24), lavenderMaterial)
        sphere.position.set(-5.15, 2.35, -1.8)
        decor.add(sphere)

        const torus = new Mesh(new TorusGeometry(0.92, 0.16, 20, 64), blueMaterial)
        torus.position.set(5.1, 2.15, -1.4)
        torus.rotation.set(0.4, -0.3, 0.45)
        decor.add(torus)

        const capsule = new Mesh(new CapsuleGeometry(0.42, 1.25, 8, 20), warmMaterial)
        capsule.position.set(-5.35, -1.05, -0.5)
        capsule.rotation.set(0.2, 0.1, -0.72)
        decor.add(capsule)

        const gem = new Mesh(new OctahedronGeometry(0.72, 1), mintMaterial)
        gem.position.set(5.15, -1.15, -0.7)
        gem.rotation.set(0.3, 0.5, 0.2)
        decor.add(gem)

        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        let pointerX = 0
        let pointerY = 0
        let animationFrame: number | null = null
        let lastFrame = 0

        const resize = () => {
            const {width, height} = canvas.getBoundingClientRect()
            if (width === 0 || height === 0) {
                return
            }

            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
            renderer.setSize(width, height, false)
            camera.aspect = width / height
            camera.updateProjectionMatrix()
            renderer.render(scene, camera)
        }

        const resizeObserver = new ResizeObserver(resize)
        resizeObserver.observe(canvas)
        resize()

        const handlePointerMove = (event: PointerEvent) => {
            pointerX = event.clientX / window.innerWidth - 0.5
            pointerY = event.clientY / window.innerHeight - 0.5
        }

        const renderFrame = (time: number) => {
            animationFrame = window.requestAnimationFrame(renderFrame)
            if (time - lastFrame < 1000 / 30) {
                return
            }
            lastFrame = time

            const seconds = time / 1000
            decor.rotation.y += (pointerX * 0.09 - decor.rotation.y) * 0.035
            decor.rotation.x += (-pointerY * 0.05 - decor.rotation.x) * 0.035
            sphere.position.y = 2.35 + Math.sin(seconds * 0.42) * 0.1
            torus.rotation.z = 0.45 + Math.sin(seconds * 0.28) * 0.12
            capsule.position.y = -1.05 + Math.sin(seconds * 0.36 + 1.7) * 0.08
            gem.rotation.y = 0.5 + seconds * 0.06
            renderer.render(scene, camera)
        }

        const handleVisibilityChange = () => {
            if (document.hidden && animationFrame !== null) {
                window.cancelAnimationFrame(animationFrame)
                animationFrame = null
            } else if (!document.hidden && !prefersReducedMotion && animationFrame === null) {
                animationFrame = window.requestAnimationFrame(renderFrame)
            }
        }

        if (!prefersReducedMotion) {
            window.addEventListener('pointermove', handlePointerMove, {passive: true})
            document.addEventListener('visibilitychange', handleVisibilityChange)
            animationFrame = window.requestAnimationFrame(renderFrame)
        }

        return () => {
            if (animationFrame !== null) {
                window.cancelAnimationFrame(animationFrame)
            }
            window.removeEventListener('pointermove', handlePointerMove)
            document.removeEventListener('visibilitychange', handleVisibilityChange)
            resizeObserver.disconnect()
            scene.traverse((object) => {
                if (object instanceof Mesh) {
                    object.geometry.dispose()
                    const materials = Array.isArray(object.material) ? object.material : [object.material]
                    materials.forEach((material) => material.dispose())
                }
            })
            grid.geometry.dispose()
            gridMaterial.dispose()
            renderer.dispose()
            renderer.forceContextLoss()
        }
    }, [])

    return (
        <div className="map-environment" aria-hidden="true">
            <canvas ref={canvasRef} className="map-environment__canvas"/>
            <div className="map-environment__fallback">
                <span className="map-environment__shape map-environment__shape--sphere"/>
                <span className="map-environment__shape map-environment__shape--ring"/>
                <span className="map-environment__shape map-environment__shape--capsule"/>
                <span className="map-environment__shape map-environment__shape--gem"/>
            </div>
        </div>
    )
}
