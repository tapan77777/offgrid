package com.offgrid.p2p

import android.util.Log
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.IOException
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Phase 3 diagnostic transport (D-065):
 *   • Length-prefixed framing: 4-byte big-endian unsigned int32 length, then payload bytes.
 *   • TCP port 8988.
 *   • Group owner starts a ServerSocket; the other side connects as client with retry.
 *
 * This class is deliberately minimal: no encryption, no fragmentation, single peer,
 * one live socket at a time. Diagnostic only.
 */
internal class SocketWorker(
    private val onFrame: (fromAddress: String, base64: String) -> Unit,
    private val onError: (message: String, throwable: Throwable?) -> Unit,
) {
    companion object {
        private const val TAG = "OffgridP2pSocket"
        private const val PORT = 8988
        private const val MAX_FRAME_BYTES = 64 * 1024
        private const val CONNECT_RETRY_ATTEMPTS = 5
        private const val CONNECT_RETRY_INITIAL_DELAY_MS = 250L
        private const val CONNECT_TIMEOUT_MS = 4000
    }

    private val executor: ExecutorService = Executors.newCachedThreadPool { runnable ->
        Thread(runnable, "OffgridP2pSocket").apply { isDaemon = true }
    }
    private val running = AtomicBoolean(false)

    @Volatile private var serverSocket: ServerSocket? = null
    @Volatile private var activeSocket: Socket? = null
    @Volatile private var remoteAddress: String = ""

    fun startAsGroupOwner() {
        if (!running.compareAndSet(false, true)) return
        executor.execute {
            try {
                val server = ServerSocket(PORT)
                serverSocket = server
                Log.i(TAG, "ServerSocket listening on $PORT")
                while (running.get()) {
                    val client = try {
                        server.accept()
                    } catch (io: IOException) {
                        if (running.get()) onError("accept() failed", io)
                        break
                    }
                    installSocket(client, client.inetAddress?.hostAddress ?: "")
                }
            } catch (e: Exception) {
                onError("server startup failed", e)
                running.set(false)
            }
        }
    }

    fun startAsClient(groupOwnerAddress: String) {
        if (!running.compareAndSet(false, true)) return
        executor.execute {
            var delay = CONNECT_RETRY_INITIAL_DELAY_MS
            var lastError: Throwable? = null
            for (attempt in 1..CONNECT_RETRY_ATTEMPTS) {
                if (!running.get()) return@execute
                try {
                    val socket = Socket()
                    socket.connect(
                        InetSocketAddress(InetAddress.getByName(groupOwnerAddress), PORT),
                        CONNECT_TIMEOUT_MS,
                    )
                    Log.i(TAG, "Connected to group owner $groupOwnerAddress on attempt $attempt")
                    installSocket(socket, groupOwnerAddress)
                    return@execute
                } catch (e: IOException) {
                    lastError = e
                    Log.w(TAG, "Client connect attempt $attempt failed: ${e.message}")
                    try {
                        Thread.sleep(delay)
                    } catch (_: InterruptedException) {
                        Thread.currentThread().interrupt()
                        return@execute
                    }
                    delay *= 2
                }
            }
            onError("client connect exhausted retries", lastError)
            running.set(false)
        }
    }

    fun sendFrame(payload: ByteArray) {
        val socket = activeSocket
            ?: throw IOException("SocketWorker: no active connection")
        if (payload.size > MAX_FRAME_BYTES) {
            throw IOException("SocketWorker: frame exceeds max size (${payload.size} > $MAX_FRAME_BYTES)")
        }
        val out = DataOutputStream(socket.getOutputStream())
        synchronized(socket) {
            out.writeInt(payload.size)
            out.write(payload)
            out.flush()
        }
    }

    fun stop() {
        if (!running.compareAndSet(true, false)) return
        try { activeSocket?.close() } catch (_: IOException) {}
        try { serverSocket?.close() } catch (_: IOException) {}
        activeSocket = null
        serverSocket = null
        remoteAddress = ""
    }

    fun shutdown() {
        stop()
        executor.shutdownNow()
    }

    private fun installSocket(socket: Socket, fromAddress: String) {
        val previous = activeSocket
        activeSocket = socket
        remoteAddress = fromAddress
        if (previous != null && previous !== socket) {
            try { previous.close() } catch (_: IOException) {}
        }
        executor.execute { readLoop(socket, fromAddress) }
    }

    private fun readLoop(socket: Socket, fromAddress: String) {
        try {
            val input = DataInputStream(socket.getInputStream())
            val buffer = ByteArrayOutputStream()
            while (running.get() && !socket.isClosed) {
                val length = try {
                    input.readInt()
                } catch (eof: IOException) {
                    Log.i(TAG, "readInt EOF on $fromAddress: ${eof.message}")
                    break
                }
                if (length <= 0 || length > MAX_FRAME_BYTES) {
                    onError("invalid frame length: $length", null)
                    break
                }
                buffer.reset()
                var remaining = length
                val chunk = ByteArray(4096)
                while (remaining > 0) {
                    val read = input.read(chunk, 0, minOf(chunk.size, remaining))
                    if (read == -1) throw IOException("stream closed mid-frame")
                    buffer.write(chunk, 0, read)
                    remaining -= read
                }
                val base64 = android.util.Base64.encodeToString(
                    buffer.toByteArray(),
                    android.util.Base64.NO_WRAP,
                )
                onFrame(fromAddress, base64)
            }
        } catch (e: IOException) {
            if (running.get()) onError("read loop failed", e)
        } finally {
            try { socket.close() } catch (_: IOException) {}
            if (activeSocket === socket) activeSocket = null
        }
    }
}
