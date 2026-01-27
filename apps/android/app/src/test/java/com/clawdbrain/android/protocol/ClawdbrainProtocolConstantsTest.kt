package com.clawdbrain.android.protocol

import org.junit.Assert.assertEquals
import org.junit.Test

class ClawdbrainProtocolConstantsTest {
  @Test
  fun canvasCommandsUseStableStrings() {
    assertEquals("canvas.present", ClawdbrainCanvasCommand.Present.rawValue)
    assertEquals("canvas.hide", ClawdbrainCanvasCommand.Hide.rawValue)
    assertEquals("canvas.navigate", ClawdbrainCanvasCommand.Navigate.rawValue)
    assertEquals("canvas.eval", ClawdbrainCanvasCommand.Eval.rawValue)
    assertEquals("canvas.snapshot", ClawdbrainCanvasCommand.Snapshot.rawValue)
  }

  @Test
  fun a2uiCommandsUseStableStrings() {
    assertEquals("canvas.a2ui.push", ClawdbrainCanvasA2UICommand.Push.rawValue)
    assertEquals("canvas.a2ui.pushJSONL", ClawdbrainCanvasA2UICommand.PushJSONL.rawValue)
    assertEquals("canvas.a2ui.reset", ClawdbrainCanvasA2UICommand.Reset.rawValue)
  }

  @Test
  fun capabilitiesUseStableStrings() {
    assertEquals("canvas", ClawdbrainCapability.Canvas.rawValue)
    assertEquals("camera", ClawdbrainCapability.Camera.rawValue)
    assertEquals("screen", ClawdbrainCapability.Screen.rawValue)
    assertEquals("voiceWake", ClawdbrainCapability.VoiceWake.rawValue)
  }

  @Test
  fun screenCommandsUseStableStrings() {
    assertEquals("screen.record", ClawdbrainScreenCommand.Record.rawValue)
  }
}
