import {defineConfig, PluginOption} from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

const dataDir = path.join(process.cwd(), 'public/data')
const transitionsPath = path.join(dataDir, 'transitions.json')
const posesPath = path.join(dataDir, 'poses.json')

type ApiHandler = (body: any) => { code: number; data: any }

const apiRoutes: Record<string, ApiHandler> = {
  'POST:/api/transitions': (body) => {
    if (!body.fromPoseId || !body.toPoseId) {
      return { code: 400, data: { error: 'fromPoseId and toPoseId are required' } }
    }

    const transitions = JSON.parse(fs.readFileSync(transitionsPath, 'utf-8'))

    transitions.push({
      fromPoseId: body.fromPoseId,
      toPoseId: body.toPoseId,
      ...(body.nonReversible && { nonReversible: true }),
    })

    const tmpPath = transitionsPath + '.tmp'
    fs.writeFileSync(tmpPath, JSON.stringify(transitions, null, 2) + '\n')
    fs.renameSync(tmpPath, transitionsPath)

    return { code: 201, data: { success: true, transition: body } }
  },

  'DELETE:/api/transitions': (body) => {
    if (!body.fromPoseId || !body.toPoseId) {
      return { code: 400, data: { error: 'fromPoseId and toPoseId are required' } }
    }

    const transitions = JSON.parse(fs.readFileSync(transitionsPath, 'utf-8'))

    const filtered = transitions.filter((t: any) =>
      !(t.fromPoseId === body.fromPoseId && t.toPoseId === body.toPoseId)
    )

    if (filtered.length === transitions.length) {
      return { code: 404, data: { error: 'Transition not found' } }
    }

    const tmpPath = transitionsPath + '.tmp'
    fs.writeFileSync(tmpPath, JSON.stringify(filtered, null, 2) + '\n')
    fs.renameSync(tmpPath, transitionsPath)

    return { code: 200, data: { success: true } }
  },

  'POST:/api/poses': (body) => {
    if (!body.id) {
      return { code: 400, data: { error: 'id is required' } }
    }

    const poses = JSON.parse(fs.readFileSync(posesPath, 'utf-8'))

    if (poses.some((p: any) => p.id === body.id)) {
      return { code: 400, data: { error: 'Pose with this ID already exists' } }
    }

    poses.push({
      id: body.id,
      ...(body.name && { name: body.name }),
      ...(body.description && { description: body.description }),
      ...(body.mirroredPoseId && { mirroredPoseId: body.mirroredPoseId }),
    })

    const tmpPath = posesPath + '.tmp'
    fs.writeFileSync(tmpPath, JSON.stringify(poses, null, 2) + '\n')
    fs.renameSync(tmpPath, posesPath)

    return { code: 201, data: { success: true, pose: body } }
  },

  'PUT:/api/poses': (body) => {
    if (!body.id) {
      return { code: 400, data: { error: 'id is required' } }
    }

    const poses = JSON.parse(fs.readFileSync(posesPath, 'utf-8'))
    const poseIndex = poses.findIndex((p: any) => p.id === body.id)

    if (poseIndex === -1) {
      return { code: 404, data: { error: 'Pose not found' } }
    }

    poses[poseIndex] = {
      id: body.id,
      ...(body.name !== undefined && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.mirroredPoseId !== undefined && { mirroredPoseId: body.mirroredPoseId }),
    }

    const tmpPath = posesPath + '.tmp'
    fs.writeFileSync(tmpPath, JSON.stringify(poses, null, 2) + '\n')
    fs.renameSync(tmpPath, posesPath)

    return { code: 200, data: { success: true, pose: poses[poseIndex] } }
  },
}

const DataEditApiPlugin: PluginOption = {
  name: 'data-edit-api',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      // Only handle API routes in dev mode
      if (!req.url?.startsWith('/api/')) {
        return next()
      }

      // Parse JSON body
      let body = ''
      req.on('data', chunk => {
        body += chunk.toString()
      })

      req.on('end', async () => {
        try {
          const parsedBody = body ? JSON.parse(body) : {}
          const routeKey = `${req.method}:${req.url}`
          const handler = apiRoutes[routeKey]

          if (!handler) {
            res.statusCode = 404
            res.end(JSON.stringify({ error: 'Not found' }))
            return
          }

          const { code, data } = handler(parsedBody)
          res.statusCode = code
          res.end(JSON.stringify(data))
        } catch (error) {
          res.statusCode = 500
          res.end(JSON.stringify({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
          }))
        }
      })
    })
  },
}

export default defineConfig({
  plugins: [react(), DataEditApiPlugin],
  base: '/acroyoga-db/',
  server: {
    port: 5173,
  },
})
