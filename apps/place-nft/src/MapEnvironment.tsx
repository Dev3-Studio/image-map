import {useEffect, useRef} from 'react'
import {
    Mesh,
    OrthographicCamera,
    PlaneGeometry,
    Scene,
    ShaderMaterial,
    SRGBColorSpace,
    Vector2,
    WebGLRenderer,
} from 'three'
import './MapEnvironment.css'

const vertexShader = `
varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
}
`

const fragmentShader = `
uniform float uTime;
uniform float uAspect;
uniform vec2 uPointer;
varying vec2 vUv;

float random(vec2 position) {
    return fract(sin(dot(position, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    float drift = sin(uTime * 0.08) * 0.012;
    vec2 center = vec2(
        0.5 + uPointer.x * 0.025 + drift,
        0.46 - uPointer.y * 0.018
    );
    vec2 distanceFromCenter = (vUv - center) * vec2(uAspect, 1.0);
    float ambientLight = exp(-dot(distanceFromCenter, distanceFromCenter) * 0.34);
    float verticalFade = smoothstep(0.0, 1.0, vUv.y);
    float edgeShade = smoothstep(0.28, 0.82, length(distanceFromCenter));

    vec3 lowerColor = vec3(0.925, 0.945, 0.975);
    vec3 upperColor = vec3(0.992, 0.994, 1.0);
    vec3 color = mix(lowerColor, upperColor, verticalFade);
    color += ambientLight * vec3(0.022, 0.025, 0.038);
    color -= edgeShade * vec3(0.012, 0.014, 0.018);
    color += (random(gl_FragCoord.xy) - 0.5) / 255.0;

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
}
`

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
                antialias: false,
                powerPreference: 'low-power',
            })
        } catch {
            canvas.hidden = true
            return
        }

        renderer.outputColorSpace = SRGBColorSpace

        const scene = new Scene()
        const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
        const uniforms = {
            uTime: {value: 0},
            uAspect: {value: 1},
            uPointer: {value: new Vector2()},
        }
        const material = new ShaderMaterial({
            uniforms,
            vertexShader,
            fragmentShader,
            depthTest: false,
            depthWrite: false,
        })
        const atmosphere = new Mesh(new PlaneGeometry(2, 2), material)
        scene.add(atmosphere)

        const pointerTarget = new Vector2()
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        let animationFrame: number | null = null
        let lastFrame = 0

        const resize = () => {
            const {width, height} = canvas.getBoundingClientRect()
            if (width === 0 || height === 0) {
                return
            }

            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25))
            renderer.setSize(width, height, false)
            uniforms.uAspect.value = width / height
            renderer.render(scene, camera)
        }

        const resizeObserver = new ResizeObserver(resize)
        resizeObserver.observe(canvas)
        resize()

        const handlePointerMove = (event: PointerEvent) => {
            pointerTarget.set(
                event.clientX / window.innerWidth - 0.5,
                event.clientY / window.innerHeight - 0.5,
            )
        }

        const renderFrame = (time: number) => {
            animationFrame = window.requestAnimationFrame(renderFrame)
            if (time - lastFrame < 1000 / 24) {
                return
            }
            lastFrame = time

            uniforms.uTime.value = time / 1000
            uniforms.uPointer.value.lerp(pointerTarget, 0.035)
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
            atmosphere.geometry.dispose()
            material.dispose()
            renderer.dispose()
            renderer.forceContextLoss()
        }
    }, [])

    return (
        <div className="map-environment" aria-hidden="true">
            <canvas ref={canvasRef} className="map-environment__canvas"/>
        </div>
    )
}
