/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  safelist: [
    'col-span-1', 'col-span-2', 'col-span-3', 'col-span-4', 'col-span-5', 'col-span-6',
    'col-span-7', 'col-span-8', 'col-span-9', 'col-span-10', 'col-span-11', 'col-span-12',
    'md:col-span-1', 'md:col-span-2', 'md:col-span-3', 'md:col-span-4', 'md:col-span-5', 'md:col-span-6',
    'md:col-span-7', 'md:col-span-8', 'md:col-span-9', 'md:col-span-10', 'md:col-span-11', 'md:col-span-12',
  ],
  theme: {
  	extend: {
  		colors: {
  			theme: {
  				primary: 'rgb(var(--color-bg-primary) / <alpha-value>)',
  				secondary: 'rgb(var(--color-bg-secondary) / <alpha-value>)',
  				tertiary: 'rgb(var(--color-bg-tertiary) / <alpha-value>)',
  				accent: 'rgb(var(--color-bg-accent) / <alpha-value>)',
  				surface: 'rgb(var(--color-surface-primary) / <alpha-value>)',
  				elevated: 'rgb(var(--color-surface-elevated) / <alpha-value>)'
  			},
  			text: {
  				theme: {
  					primary: 'rgb(var(--color-text-primary) / <alpha-value>)',
  					secondary: 'rgb(var(--color-text-secondary) / <alpha-value>)',
  					tertiary: 'rgb(var(--color-text-tertiary) / <alpha-value>)',
  					accent: 'rgb(var(--color-text-accent) / <alpha-value>)',
  					inverse: 'rgb(var(--color-text-inverse) / <alpha-value>)'
  				}
  			},
  			border: 'hsl(var(--border))',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		},
  		animation: {
  			'theme-transition': 'theme-transition 0.3s ease-in-out',
  			'gradient': 'gradient 8s linear infinite'
  		},
  		keyframes: {
  			'theme-transition': {
  				'0%': {
  					opacity: '0.8'
  				},
  				'100%': {
  					opacity: '1'
  				}
  			},
  			'gradient': {
  				'0%': { backgroundPosition: '0% 50%' },
  				'50%': { backgroundPosition: '100% 50%' },
  				'100%': { backgroundPosition: '0% 50%' }
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
};
