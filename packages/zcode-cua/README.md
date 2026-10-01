# @zcode/zcode-cua

The Computer Use runtime starts the bundled macOS executor through the
`maka.cu/2` stdio protocol. Windows and Linux use platform-specific native
MCP stdio executors. Other legacy surfaces (Helper install/launch/verify,
PiP session client, native addon loader) remain unavailable and fail closed.

License: Apache-2.0.
