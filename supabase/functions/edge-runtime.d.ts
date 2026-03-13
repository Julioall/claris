/// <reference path="../../node_modules/@supabase/functions-js/src/edge-runtime.d.ts" />

declare namespace Deno {
	function serve(handler: (request: Request) => Response | Promise<Response>): void
	function serve(
		options: {
			port?: number
			hostname?: string
			signal?: AbortSignal
			onListen?: false | ((params: { hostname: string; port: number }) => void)
		},
		handler: (request: Request) => Response | Promise<Response>
	): void
}