import {useEffect, useRef, useState, type CSSProperties} from 'react'
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

interface AtmosphereSettings {
    reflection: number
    frost: number
    tint: number
    depth: number
    fog: number
}

interface AtmosphereShader {
    uniforms: {
        uReflection: {value: number}
        uFrost: {value: number}
        uTint: {value: number}
        uDepth: {value: number}
        uFog: {value: number}
    }
    render: () => void
}

const STORAGE_KEY = 'tessera-atmosphere-settings'
const DEFAULT_SETTINGS: AtmosphereSettings = {
    reflection: 0.18,
    frost: 0.08,
    tint: 0.12,
    depth: 0.2,
    fog: 0.14,
}
const CONTROLS: Array<{
    key: keyof AtmosphereSettings
    label: string
    description: string
}> = [
    {key: 'reflection', label: 'Reflection', description: 'Strength of the soft glass highlight'},
    {key: 'frost', label: 'Frost', description: 'Diffusion and surface texture'},
    {key: 'tint', label: 'Cool tint', description: 'Blue-lavender color cast'},
    {key: 'depth', label: 'Depth', description: 'Edge shading behind the canvas'},
    {key: 'fog', label: 'Fog', description: 'Soft ambient haze around the canvas'},
]

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
uniform float uReflection;
uniform float uFrost;
uniform float uTint;
uniform float uDepth;
uniform float uFog;
uniform vec2 uPointer;
varying vec2 vUv;

float random(vec2 position) {
    return fract(sin(dot(position, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    float drift = sin(uTime * 0.08) * 0.012;
    float refraction = sin(vUv.x * 5.0 + uTime * 0.035)
        * sin(vUv.y * 7.0 - uTime * 0.028)
        * uFrost
        * 0.025;
    vec2 glassUv = vUv + vec2(refraction, refraction * 0.7);
    vec2 center = vec2(
        0.5 + uPointer.x * 0.025 + drift,
        0.46 - uPointer.y * 0.018
    );
    vec2 distanceFromCenter = (glassUv - center) * vec2(uAspect, 1.0);
    float ambientLight = exp(-dot(distanceFromCenter, distanceFromCenter) * 0.34);
    float verticalFade = smoothstep(0.0, 1.0, glassUv.y);
    float edgeShade = smoothstep(0.28, 0.86, length(distanceFromCenter));

    vec3 lowerColor = vec3(0.925, 0.945, 0.975);
    vec3 upperColor = vec3(0.992, 0.994, 1.0);
    vec3 color = mix(lowerColor, upperColor, verticalFade);
    color += ambientLight * vec3(0.022, 0.025, 0.038);
    color -= edgeShade * uDepth * vec3(0.14, 0.15, 0.19);

    float reflectionLine = glassUv.x * 0.72 + glassUv.y * 0.42;
    float reflectionCenter = 0.68 + uPointer.x * 0.04 + sin(uTime * 0.045) * 0.016;
    float sheen = exp(-pow((reflectionLine - reflectionCenter) * 2.25, 2.0));
    color += sheen * uReflection * vec3(0.22, 0.24, 0.3);
    color = mix(color, vec3(0.975, 0.982, 1.0), uFrost * 0.22);
    color += uTint * vec3(-0.055, -0.02, 0.09);
    float fogDrift = sin(glassUv.x * 2.4 + uTime * 0.022) * 0.055
        + sin(glassUv.y * 3.1 - uTime * 0.018) * 0.035;
    float fogDensity = smoothstep(0.08, 1.0, 0.78 - glassUv.y + ambientLight * 0.24 + fogDrift);
    color = mix(color, vec3(0.955, 0.968, 0.992), uFog * (0.18 + fogDensity * 0.5));
    color += (random(gl_FragCoord.xy) - 0.5) * (0.002 + uFrost * 0.024);
    color = clamp(color, 0.0, 1.0);

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
}
`

export default function MapEnvironment({
    reflectionPreviewUrl,
    reflectionPreviewAvifUrl,
}: {
    reflectionPreviewUrl: string
    reflectionPreviewAvifUrl?: string
}) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const shaderRef = useRef<AtmosphereShader | null>(null)
    const [controlsOpen, setControlsOpen] = useState(false)
    const [settings, setSettings] = useState<AtmosphereSettings>(() => {
        try {
            const stored = window.localStorage.getItem(STORAGE_KEY)
            if (!stored) {
                return DEFAULT_SETTINGS
            }

            const parsed = JSON.parse(stored) as Partial<AtmosphereSettings>
            const savedValue = (key: keyof AtmosphereSettings) => {
                const value = parsed[key]
                return typeof value === 'number' && Number.isFinite(value)
                    ? Math.max(0, Math.min(1, value))
                    : DEFAULT_SETTINGS[key]
            }
            return {
                reflection: savedValue('reflection'),
                frost: savedValue('frost'),
                tint: savedValue('tint'),
                depth: savedValue('depth'),
                fog: savedValue('fog'),
            }
        } catch {
            return DEFAULT_SETTINGS
        }
    })
    const initialSettingsRef = useRef(settings)

    useEffect(() => {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
        } catch {
            // The live controls still work when storage is unavailable.
        }

        const shader = shaderRef.current
        if (shader) {
            shader.uniforms.uReflection.value = settings.reflection
            shader.uniforms.uFrost.value = settings.frost
            shader.uniforms.uTint.value = settings.tint
            shader.uniforms.uDepth.value = settings.depth
            shader.uniforms.uFog.value = settings.fog
            shader.render()
        }
    }, [settings])

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
            uReflection: {value: initialSettingsRef.current.reflection},
            uFrost: {value: initialSettingsRef.current.frost},
            uTint: {value: initialSettingsRef.current.tint},
            uDepth: {value: initialSettingsRef.current.depth},
            uFog: {value: initialSettingsRef.current.fog},
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

        shaderRef.current = {
            uniforms,
            render: () => renderer.render(scene, camera),
        }

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
            shaderRef.current = null
            atmosphere.geometry.dispose()
            material.dispose()
            renderer.dispose()
            renderer.forceContextLoss()
        }
    }, [])

    const environmentStyle = {
        '--atmosphere-reflection': settings.reflection,
        '--atmosphere-frost': settings.frost,
        '--atmosphere-tint': settings.tint,
        '--atmosphere-depth': settings.depth,
        '--atmosphere-fog': settings.fog,
    } as CSSProperties

    return (
        <>
            <div className="map-environment" style={environmentStyle} aria-hidden="true">
                <canvas ref={canvasRef} className="map-environment__canvas"/>
                <picture className="map-environment__reflection">
                    {reflectionPreviewAvifUrl ? (
                        <source type="image/avif" srcSet={reflectionPreviewAvifUrl}/>
                    ) : null}
                    <img
                        src={reflectionPreviewUrl}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        fetchPriority="low"
                        draggable={false}
                    />
                </picture>
            </div>
            <div className={`atmosphere-controls ${controlsOpen ? 'atmosphere-controls--open' : ''}`}>
                <button
                    className="glass-surface atmosphere-toggle"
                    type="button"
                    aria-expanded={controlsOpen}
                    aria-controls="atmosphere-panel"
                    onClick={() => setControlsOpen((open) => !open)}
                >
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <line x1="2" y1="4" x2="14" y2="4"/>
                        <circle cx="6" cy="4" r="1.7"/>
                        <line x1="2" y1="8" x2="14" y2="8"/>
                        <circle cx="11" cy="8" r="1.7"/>
                        <line x1="2" y1="12" x2="14" y2="12"/>
                        <circle cx="8" cy="12" r="1.7"/>
                    </svg>
                    <span>Atmosphere</span>
                </button>
                {controlsOpen ? (
                    <section id="atmosphere-panel" className="glass-surface atmosphere-panel" aria-label="Atmosphere controls">
                        <div className="atmosphere-panel__heading">
                            <div>
                                <strong>Glass atmosphere</strong>
                                <small>Saved on this device</small>
                            </div>
                            <button type="button" onClick={() => setSettings(DEFAULT_SETTINGS)}>Reset</button>
                        </div>
                        {CONTROLS.map((control) => (
                            <label className="atmosphere-control" key={control.key}>
                                <span>
                                    <strong>{control.label}</strong>
                                    <output>{Math.round(settings[control.key] * 100)}%</output>
                                </span>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    step="1"
                                    value={Math.round(settings[control.key] * 100)}
                                    aria-label={control.label}
                                    onChange={(event) => {
                                        const value = Number(event.currentTarget.value) / 100
                                        setSettings((current) => ({...current, [control.key]: value}))
                                    }}
                                />
                                <small>{control.description}</small>
                            </label>
                        ))}
                    </section>
                ) : null}
            </div>
        </>
    )
}
