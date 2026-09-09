# Login Screen Specification

This document describes the exact login screen design used across all applications. Follow this specification precisely to ensure a consistent look and feel.

---

## Overall Layout

The login page is a **split-screen layout** that fills the full viewport height (`min-h-screen flex`).

- **Left panel (desktop only):** A dark branded panel — 55% width on large screens, 60% on extra-large. Hidden on screens smaller than `lg` (1024px).
- **Right panel:** The login form — takes remaining width on desktop, full width on mobile.

---

## Left Panel — Branded Hero (Desktop Only)

### Container
```
- Hidden below lg breakpoint: `hidden lg:flex`
- Width: `lg:w-[55%] xl:w-[60%]`
- Overflow: `overflow-hidden`
- Background: `linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #1e293b 100%)`
- Position: `relative`
```

### Dot Grid Overlay
An absolutely positioned overlay creates a subtle dot-grid pattern:
```
- Position: `absolute inset-0`
- Opacity: `opacity-20`
- Background image: `radial-gradient(circle at 1px 1px, rgba(148, 163, 184, 0.3) 1px, transparent 0)`
- Background size: `24px 24px`
```

### Animated Threads Effect
A WebGL-powered animated thread/wave effect positioned in the center of the panel:
```
- Position: `absolute inset-x-0 top-1/2 -translate-y-1/2 h-[300px] z-[1]`
- Color: RGB tuple [0.96, 0.62, 0.04] (amber/orange tone)
- Amplitude: 2
- Distance: 0.1
- Mouse interaction: enabled
```

**Implementation:** This uses the `ogl` library (WebGL) to render animated flowing threads/lines using a custom fragment shader with Perlin noise. The component renders a full-size canvas inside its container.

**Required dependency:** `ogl` (npm package)

**Full Threads component source is provided below in the Components section.**

### Content Layout
The left panel content uses `flex flex-col justify-between` with padding `p-12 xl:p-16` and `z-10` to sit above the background effects.

#### Top Section — Logo & Title
1. **Company logo** (if available from branding config):
   - `<img>` tag with dynamic height from `loginLogoSize` (default 80px)
   - Classes: `w-auto object-contain mb-8`
2. **Fallback logo** (if no custom logo):
   - A square container: `w-16 h-16 xl:w-20 xl:h-20`
   - Background: `bg-gradient-to-br from-amber-400 to-orange-500`
   - Rounded: `rounded-xl`
   - Contains a Building2 icon (from lucide-react): `h-8 w-8 xl:h-10 xl:w-10 text-white`
   - Bottom margin: `mb-8`, shadow: `shadow-lg`
3. **Company name** (if branding has `showCompanyName` enabled):
   - `text-4xl xl:text-5xl font-bold text-white mb-2 leading-tight`
4. **Gradient animated title** — "Welcome to Parse-It" (replace with your app name):
   - Uses the GradientText component (source below)
   - Colors: `["#ff0000", "#ff8800", "#ffaa00", "#ff8800", "#ff0000"]`
   - Animation speed: 3 seconds
   - Classes: `text-2xl xl:text-3xl font-semibold mb-1`
5. **Subtitle:**
   - `text-slate-400 text-base`
   - Text: "PDF Data Extraction" (replace with your app tagline)

#### Bottom Section — Feature Cards
A vertical stack (`space-y-6 mt-auto`) of feature highlight cards. Each card:
```
- Layout: `flex items-start gap-4`
- Icon container: `w-10 h-10 rounded-lg bg-slate-700/50 flex items-center justify-center flex-shrink-0 border border-slate-600/50`
- Icon: `h-5 w-5 text-amber-500` (use lucide-react icons)
- Title: `text-white font-semibold mb-1`
- Description: `text-slate-400 text-sm`
```

Example features (customize per app):
| Icon | Title | Description |
|------|-------|-------------|
| FileSearch | Extract | Extract data from documents using AI to quickly create Freight Bills and send to document imaging. |
| Wand2 | Transform | Transform documents using AI to rename and send to document imaging. |
| GitBranch | Workflows | Use workflows to look up data via APIs, transform file names and email or SFTP. |

---

## Right Panel — Login Form

### Container
```
- Background: `bg-gradient-to-br from-slate-50 to-slate-100`
- Flex column: `flex-1 flex flex-col`
- Inner wrapper: `flex-1 flex items-center justify-center p-6 sm:p-8`
- Form max width: `w-full max-w-md`
```

### Mobile-Only Header (below lg breakpoint)
Shown only on mobile (`lg:hidden mb-8 text-center`):
- Displays the company logo (scaled to 60% of desktop size, max 48px) or the fallback amber gradient icon (smaller: `w-12 h-12`)
- Company name in `text-xl font-bold text-slate-900`

### Form Card
```
- Container: `bg-white rounded-2xl shadow-xl p-8 sm:p-10`
```

#### Form Header
```
- Centered text: `text-center mb-8`
- Heading: `text-2xl font-bold text-slate-900 mb-2` — "Welcome back"
- Subheading: `text-slate-500` — "Sign in to your account to continue"
```

#### Form Fields
The form uses `space-y-5` for vertical spacing.

**Username/Email Field:**
```
- Label: `block text-sm font-medium text-slate-700 mb-2` — "Username or Email"
- Input wrapper: `relative`
- Icon (left): Mail icon from lucide-react, `absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none`, icon is `h-5 w-5 text-slate-400`
- Input: `w-full pl-11 pr-4 py-3 border border-slate-200 bg-white text-slate-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all duration-200 placeholder:text-slate-400`
- Placeholder: "Enter your username or email"
```

**Password Field:**
```
- Label: same as above — "Password"
- Input wrapper: `relative`
- Icon (left): Lock icon, same positioning as above
- Input: `w-full pl-11 pr-12 py-3 border border-slate-200 bg-white text-slate-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all duration-200 placeholder:text-slate-400`
- Placeholder: "Enter your password"
- Toggle button (right): `absolute inset-y-0 right-0 pr-3.5 flex items-center`
  - Shows Eye or EyeOff icon: `h-5 w-5 text-slate-400 hover:text-slate-600 transition-colors`
  - Toggles between text/password input type
```

#### Remember Me & Forgot Link Row
```
- Layout: `flex items-center justify-between`
- Remember me: checkbox + label
  - Checkbox: `w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 focus:ring-offset-0`
  - Label: `text-sm text-slate-600` — "Remember me"
- Forgot link: `text-sm text-orange-500 hover:text-orange-600 font-medium transition-colors`
  - Text: "Forgot Username or Password?"
  - Opens the Forgot Credentials modal
```

#### Error Display
```
- Container: `bg-red-50 border border-red-200 rounded-xl p-3`
- Text: `text-red-600 text-sm`
- Only visible when there is an error message
```

#### Submit Button
```
- Classes: `w-full py-3.5 px-4 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-semibold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 disabled:cursor-not-allowed shadow-lg shadow-slate-900/10 hover:-translate-y-1 hover:shadow-2xl`
- Default state: text "Sign in" + ArrowRight icon (`h-5 w-5`)
- Loading state: spinning circle + "Signing in..."
  - Spinner: `animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent`
```

### Footer
Only shown if company name is present:
```
- Container: `py-6 text-center`
- Text: `text-sm text-slate-400`
- Content: "© {currentYear} {companyName}. All rights reserved."
```

---

## Forgot Credentials Modal

A centered modal overlay with two recovery options.

### Overlay
```
- Container: `fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50`
- Modal: `bg-white rounded-lg shadow-xl w-full max-w-md mx-4`
```

### Header
```
- Layout: `flex items-center justify-between p-6 border-b border-gray-200`
- Title: `text-xl font-semibold text-gray-900`
- Close button: X icon, `text-gray-400 hover:text-gray-500`
```

### Mode: Selection (default)
Two option buttons stacked vertically (`space-y-4`):

1. **Forgot Username:**
   - Icon: User (lucide-react), `w-6 h-6 text-blue-600`
   - Title: "Forgot Username" — `font-medium text-gray-900`
   - Subtitle: "We'll email your username" — `text-sm text-gray-500`
   - Button: `w-full flex items-center gap-3 p-4 border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors`

2. **Forgot Password:**
   - Icon: Lock (lucide-react), `w-6 h-6 text-blue-600`
   - Title: "Forgot Password"
   - Subtitle: "We'll send a reset link"
   - Same button styling as above

### Mode: Forgot Username Form
- Description text: `text-sm text-gray-600`
- Email input with Mail icon on left
- Input: `w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500`
- Error display: red text with AlertCircle icon
- Success display: `p-3 bg-green-50 text-green-700 text-sm rounded-lg`
- Two buttons: "Back" (outlined) and "Send Username" (blue filled: `bg-blue-600 text-white rounded-lg hover:bg-blue-700`)

### Mode: Forgot Password Form
- Same layout as username form but asks for username instead of email
- Submit button text: "Send Reset Link"

---

## Required Components

### 1. GradientText Component

A text component that applies an animated gradient color effect:

```tsx
import React, { ReactNode } from 'react';

interface GradientTextProps {
  children: ReactNode;
  className?: string;
  colors?: string[];
  animationSpeed?: number;
  showBorder?: boolean;
}

export default function GradientText({
  children,
  className = '',
  colors = ['#ffaa40', '#9c40ff', '#ffaa40'],
  animationSpeed = 8,
  showBorder = false
}: GradientTextProps) {
  const gradientStyle = {
    backgroundImage: `linear-gradient(to right, ${colors.join(', ')})`,
    animationDuration: `${animationSpeed}s`
  };

  return (
    <div
      className={`relative flex max-w-fit flex-row items-center justify-center rounded-[1.25rem] font-medium backdrop-blur transition-shadow duration-500 ${showBorder ? 'overflow-hidden' : ''} cursor-pointer ${className}`}
    >
      {showBorder && (
        <div
          className="absolute inset-0 bg-cover z-0 pointer-events-none animate-gradient"
          style={{
            ...gradientStyle,
            backgroundSize: '300% 100%'
          }}
        >
          <div
            className="absolute inset-0 bg-black rounded-[1.25rem] z-[-1]"
            style={{
              width: 'calc(100% - 2px)',
              height: 'calc(100% - 2px)',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)'
            }}
          ></div>
        </div>
      )}
      <div
        className="inline-block relative z-2 text-transparent bg-cover animate-gradient"
        style={{
          ...gradientStyle,
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          backgroundSize: '300% 100%'
        }}
      >
        {children}
      </div>
    </div>
  );
}
```

### 2. Threads Component (WebGL Animated Background)

An animated flowing-threads WebGL effect using the `ogl` library. Renders animated Perlin-noise-driven lines that respond to mouse movement.

**NPM dependency required:** `ogl`

```tsx
import { useEffect, useRef, memo } from 'react';
import { Renderer, Program, Mesh, Triangle, Color } from 'ogl';

interface ThreadsProps {
  color?: [number, number, number];
  amplitude?: number;
  distance?: number;
  enableMouseInteraction?: boolean;
}

const vertexShader = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragmentShader = `
precision highp float;

uniform float iTime;
uniform vec3 iResolution;
uniform vec3 uColor;
uniform float uAmplitude;
uniform float uDistance;
uniform vec2 uMouse;

#define PI 3.1415926538

const int u_line_count = 40;
const float u_line_width = 7.0;
const float u_line_blur = 10.0;

float Perlin2D(vec2 P) {
    vec2 Pi = floor(P);
    vec4 Pf_Pfmin1 = P.xyxy - vec4(Pi, Pi + 1.0);
    vec4 Pt = vec4(Pi.xy, Pi.xy + 1.0);
    Pt = Pt - floor(Pt * (1.0 / 71.0)) * 71.0;
    Pt += vec2(26.0, 161.0).xyxy;
    Pt *= Pt;
    Pt = Pt.xzxz * Pt.yyww;
    vec4 hash_x = fract(Pt * (1.0 / 951.135664));
    vec4 hash_y = fract(Pt * (1.0 / 642.949883));
    vec4 grad_x = hash_x - 0.49999;
    vec4 grad_y = hash_y - 0.49999;
    vec4 grad_results = inversesqrt(grad_x * grad_x + grad_y * grad_y)
        * (grad_x * Pf_Pfmin1.xzxz + grad_y * Pf_Pfmin1.yyww);
    grad_results *= 1.4142135623730950;
    vec2 blend = Pf_Pfmin1.xy * Pf_Pfmin1.xy * Pf_Pfmin1.xy
               * (Pf_Pfmin1.xy * (Pf_Pfmin1.xy * 6.0 - 15.0) + 10.0);
    vec4 blend2 = vec4(blend, vec2(1.0 - blend));
    return dot(grad_results, blend2.zxzx * blend2.wwyy);
}

float pixel(float count, vec2 resolution) {
    return (1.0 / max(resolution.x, resolution.y)) * count;
}

float lineFn(vec2 st, float width, float perc, float offset, vec2 mouse, float time, float amplitude, float distance) {
    float split_offset = (perc * 0.4);
    float split_point = 0.1 + split_offset;

    float amplitude_normal = smoothstep(split_point, 0.7, st.x);
    float amplitude_strength = 0.5;
    float finalAmplitude = amplitude_normal * amplitude_strength
                           * amplitude * (1.0 + (mouse.y - 0.5) * 0.2);

    float time_scaled = time / 10.0 + (mouse.x - 0.5) * 1.0;
    float blur = smoothstep(split_point, split_point + 0.05, st.x) * perc;

    float xnoise = mix(
        Perlin2D(vec2(time_scaled, st.x + perc) * 2.5),
        Perlin2D(vec2(time_scaled, st.x + time_scaled) * 3.5) / 1.5,
        st.x * 0.3
    );

    float y = 0.5 + (perc - 0.5) * distance + xnoise / 2.0 * finalAmplitude;

    float line_start = smoothstep(
        y + (width / 2.0) + (u_line_blur * pixel(1.0, iResolution.xy) * blur),
        y,
        st.y
    );

    float line_end = smoothstep(
        y,
        y - (width / 2.0) - (u_line_blur * pixel(1.0, iResolution.xy) * blur),
        st.y
    );

    return clamp(
        (line_start - line_end) * (1.0 - smoothstep(0.0, 1.0, pow(perc, 0.3))),
        0.0,
        1.0
    );
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;

    float line_strength = 1.0;
    for (int i = 0; i < u_line_count; i++) {
        float p = float(i) / float(u_line_count);
        line_strength *= (1.0 - lineFn(
            uv,
            u_line_width * pixel(1.0, iResolution.xy) * (1.0 - p),
            p,
            (PI * 1.0) * p,
            uMouse,
            iTime,
            uAmplitude,
            uDistance
        ));
    }

    float colorVal = 1.0 - line_strength;
    fragColor = vec4(uColor * colorVal, colorVal);
}

void main() {
    mainImage(gl_FragColor, gl_FragCoord.xy);
}
`;

function Threads({
  color = [1, 1, 1],
  amplitude = 1,
  distance = 0,
  enableMouseInteraction = false
}: ThreadsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameId = useRef<number>();

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const renderer = new Renderer({ alpha: true });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    container.appendChild(gl.canvas);

    const geometry = new Triangle(gl);
    const program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        iTime: { value: 0 },
        iResolution: {
          value: new Color(gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height)
        },
        uColor: { value: new Color(...color) },
        uAmplitude: { value: amplitude },
        uDistance: { value: distance },
        uMouse: { value: new Float32Array([0.5, 0.5]) }
      }
    });

    const mesh = new Mesh(gl, { geometry, program });

    function resize() {
      const { clientWidth, clientHeight } = container;
      renderer.setSize(clientWidth, clientHeight);
      program.uniforms.iResolution.value.r = clientWidth;
      program.uniforms.iResolution.value.g = clientHeight;
      program.uniforms.iResolution.value.b = clientWidth / clientHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    let currentMouse = [0.5, 0.5];
    let targetMouse = [0.5, 0.5];

    function handleMouseMove(e: MouseEvent) {
      const rect = container.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = 1.0 - (e.clientY - rect.top) / rect.height;
      targetMouse = [x, y];
    }
    function handleMouseLeave() {
      targetMouse = [0.5, 0.5];
    }
    if (enableMouseInteraction) {
      container.addEventListener('mousemove', handleMouseMove);
      container.addEventListener('mouseleave', handleMouseLeave);
    }

    function update(t: number) {
      if (enableMouseInteraction) {
        const smoothing = 0.05;
        currentMouse[0] += smoothing * (targetMouse[0] - currentMouse[0]);
        currentMouse[1] += smoothing * (targetMouse[1] - currentMouse[1]);
        program.uniforms.uMouse.value[0] = currentMouse[0];
        program.uniforms.uMouse.value[1] = currentMouse[1];
      } else {
        program.uniforms.uMouse.value[0] = 0.5;
        program.uniforms.uMouse.value[1] = 0.5;
      }
      program.uniforms.iTime.value = t * 0.001;

      renderer.render({ scene: mesh });
      animationFrameId.current = requestAnimationFrame(update);
    }
    animationFrameId.current = requestAnimationFrame(update);

    return () => {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
      window.removeEventListener('resize', resize);

      if (enableMouseInteraction) {
        container.removeEventListener('mousemove', handleMouseMove);
        container.removeEventListener('mouseleave', handleMouseLeave);
      }
      if (container.contains(gl.canvas)) container.removeChild(gl.canvas);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [color, amplitude, distance, enableMouseInteraction]);

  return <div ref={containerRef} className="w-full h-full" />;
}

export default memo(Threads);
```

---

## Required Tailwind Configuration

Add the following animation and keyframes to your `tailwind.config.js` under `theme.extend`:

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      animation: {
        'gradient': 'gradient 8s linear infinite',
      },
      keyframes: {
        'gradient': {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
      },
    },
  },
};
```

---

## Required NPM Dependencies

```
npm install ogl lucide-react
```

Tailwind CSS is assumed to already be set up.

---

## Color Palette Summary

| Element | Color |
|---------|-------|
| Left panel background | `#1e293b` to `#0f172a` gradient |
| Dot grid | `rgba(148, 163, 184, 0.3)` |
| Threads animation | `[0.96, 0.62, 0.04]` (amber/orange) |
| Feature icons | `text-amber-500` |
| Feature titles | `text-white` |
| Feature descriptions | `text-slate-400` |
| Right panel background | `from-slate-50 to-slate-100` |
| Form card | `bg-white` with `shadow-xl` |
| Headings | `text-slate-900` |
| Body text | `text-slate-500` |
| Labels | `text-slate-700` |
| Input borders | `border-slate-200` |
| Input focus ring | `ring-slate-900` |
| Submit button | `bg-slate-900` / `hover:bg-slate-800` |
| Forgot link | `text-orange-500` / `hover:text-orange-600` |
| Error background | `bg-red-50` with `border-red-200` |
| Error text | `text-red-600` |
| Gradient text | `#ff0000 → #ff8800 → #ffaa00 → #ff8800 → #ff0000` |

---

## Responsive Behavior

- **Desktop (lg+):** Split layout — dark branded left panel + white form right panel.
- **Mobile (<lg):** Full-width form only. Left panel is hidden. A compact mobile header appears above the form with a smaller logo and company name.
- Form card max width: `max-w-md` (28rem / 448px).
- Padding scales: `p-6` on mobile, `p-8` on sm+.
- Form card internal padding: `p-8` on mobile, `p-10` on sm+.

---

## Customization Points

When reusing this login screen for a different app, change:

1. **App name** in the GradientText component (replace "Welcome to Parse-It")
2. **Tagline** below the gradient text (replace "PDF Data Extraction")
3. **Feature cards** — update icons, titles, and descriptions to match your app
4. **Gradient text colors** — adjust if your app has a different brand palette
5. **Threads color** — change the RGB tuple to match your brand
6. **Company branding** — the screen supports dynamic logo and company name via a `CompanyBranding` config object with these fields:
   - `companyName: string`
   - `logoUrl: string`
   - `showCompanyName: boolean`
   - `loginLogoSize: number` (height in pixels, default 80)
