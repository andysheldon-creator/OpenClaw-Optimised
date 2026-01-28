package com.clawdbot.android.ui.chat

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.automirrored.filled.ScreenShare
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.clawdbot.android.chat.ChatSessionEntry

@Composable
fun ChatComposer(
  sessionKey: String,
  sessions: List<ChatSessionEntry>,
  mainSessionKey: String,
  healthOk: Boolean,
  thinkingLevel: String,
  pendingRunCount: Int,
  errorText: String?,
  attachments: List<PendingImageAttachment>,
  seamColor: Color = Color(0xFF3B82F6),
  talkEnabled: Boolean = false,
  onOpenCamera: () -> Unit = {},
  onPickImages: () -> Unit,
  onPickFiles: () -> Unit = {},
  onShareScreen: () -> Unit = {},
  onRemoveAttachment: (id: String) -> Unit,
  onSetThinkingLevel: (level: String) -> Unit,
  onSelectSession: (sessionKey: String) -> Unit,
  onRefresh: () -> Unit,
  onAbort: () -> Unit,
  onSend: (text: String) -> Unit,
  onToggleTalk: () -> Unit = {},
) {
  var input by rememberSaveable { mutableStateOf("") }
  var showMenu by remember { mutableStateOf(false) }
  var showThinkingMenu by remember { mutableStateOf(false) }
  var showSessionMenu by remember { mutableStateOf(false) }
  val haptic = LocalHapticFeedback.current

  val sessionOptions = resolveSessionChoices(sessionKey, sessions, mainSessionKey = mainSessionKey)
  val currentSessionLabel =
    sessionOptions.firstOrNull { it.key == sessionKey }?.displayName ?: sessionKey

  val hasText = input.trim().isNotEmpty()
  val canSend = pendingRunCount == 0 && (hasText || attachments.isNotEmpty()) && healthOk

  Column(
    modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
    verticalArrangement = Arrangement.spacedBy(8.dp),
  ) {
    // Error text if any
    if (!errorText.isNullOrBlank()) {
      Text(
        text = errorText,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.error,
        maxLines = 2,
        modifier = Modifier.padding(horizontal = 4.dp),
      )
    }

    // Attachments strip
    if (attachments.isNotEmpty()) {
      AttachmentsStrip(attachments = attachments, onRemoveAttachment = onRemoveAttachment)
    }

    // Main input row: [Menu] [TextField] [Orb/Send]
    Surface(
      shape = RoundedCornerShape(28.dp),
      color = MaterialTheme.colorScheme.surfaceContainerHigh,
      tonalElevation = 2.dp,
    ) {
      Row(
        modifier = Modifier.fillMaxWidth().padding(4.dp),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        // Menu button
        Box {
          IconButton(
            onClick = { showMenu = true },
            modifier = Modifier.size(44.dp),
          ) {
            Icon(
              Icons.Default.Menu,
              contentDescription = "Menu",
              tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
          }

          DropdownMenu(
            expanded = showMenu,
            onDismissRequest = { showMenu = false },
            modifier = Modifier.background(Color(0xFF3A3A4A)), // Brighter shade for contrast
          ) {
            // Attachment buttons row: Camera | Photos | Files
            Row(
              modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp),
              horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
              AttachmentButton(
                icon = Icons.Default.CameraAlt,
                label = "Camera",
                onClick = {
                  showMenu = false
                  onOpenCamera()
                },
                modifier = Modifier.weight(1f),
              )
              AttachmentButton(
                icon = Icons.Default.Image,
                label = "Photos",
                onClick = {
                  showMenu = false
                  onPickImages()
                },
                modifier = Modifier.weight(1f),
              )
              AttachmentButton(
                icon = Icons.Default.AttachFile,
                label = "Files",
                onClick = {
                  showMenu = false
                  onPickFiles()
                },
                modifier = Modifier.weight(1f),
              )
            }
            
            HorizontalDivider(
              modifier = Modifier.padding(vertical = 8.dp),
              color = Color.White.copy(alpha = 0.15f),
            )
            
            // Share screen
            DropdownMenuItem(
              text = { Text("Share screen", color = Color.White) },
              onClick = { 
                showMenu = false
                onShareScreen()
              },
              leadingIcon = { Icon(Icons.AutoMirrored.Filled.ScreenShare, contentDescription = null, tint = Color.White.copy(alpha = 0.8f)) },
            )
            
            // Settings (Session & Thinking)
            var showSettingsSubmenu by remember { mutableStateOf(false) }
            DropdownMenuItem(
              text = { Text("Settings", color = Color.White) },
              onClick = { 
                showSettingsSubmenu = !showSettingsSubmenu
              },
              leadingIcon = { Icon(Icons.Default.Tune, contentDescription = null, tint = Color.White.copy(alpha = 0.8f)) },
              trailingIcon = { 
                Text(
                  if (showSettingsSubmenu) "▲" else "▼", 
                  color = Color.White.copy(alpha = 0.5f),
                  style = MaterialTheme.typography.bodySmall
                ) 
              },
            )
            
            if (showSettingsSubmenu) {
              // Session selector (indented)
              DropdownMenuItem(
                text = { Text("  Session", color = Color.White.copy(alpha = 0.9f)) },
                onClick = { 
                  showMenu = false
                  showSessionMenu = true 
                },
                trailingIcon = { Text(currentSessionLabel, color = Color.White.copy(alpha = 0.5f), style = MaterialTheme.typography.labelSmall) },
              )
              
              // Thinking level (indented)
              DropdownMenuItem(
                text = { Text("  Thinking", color = Color.White.copy(alpha = 0.9f)) },
                onClick = { 
                  showMenu = false
                  showThinkingMenu = true 
                },
                trailingIcon = { Text(thinkingLabel(thinkingLevel), color = Color.White.copy(alpha = 0.5f), style = MaterialTheme.typography.labelSmall) },
              )
            }
            
            HorizontalDivider(
              modifier = Modifier.padding(vertical = 8.dp),
              color = Color.White.copy(alpha = 0.15f),
            )
            
            // Refresh
            DropdownMenuItem(
              text = { Text("Refresh", color = Color.White) },
              onClick = { 
                showMenu = false
                onRefresh() 
              },
              leadingIcon = { Icon(Icons.Default.Refresh, contentDescription = null, tint = Color.White.copy(alpha = 0.8f)) },
            )
          }
        }

        // Session menu (separate dropdown)
        DropdownMenu(expanded = showSessionMenu, onDismissRequest = { showSessionMenu = false }) {
          for (entry in sessionOptions) {
            DropdownMenuItem(
              text = { Text(entry.displayName ?: entry.key) },
              onClick = {
                onSelectSession(entry.key)
                showSessionMenu = false
              },
              trailingIcon = {
                if (entry.key == sessionKey) Text("✓") else Spacer(Modifier.width(10.dp))
              },
            )
          }
        }

        // Thinking menu (separate dropdown)
        DropdownMenu(expanded = showThinkingMenu, onDismissRequest = { showThinkingMenu = false }) {
          ThinkingMenuItem("off", thinkingLevel, onSetThinkingLevel) { showThinkingMenu = false }
          ThinkingMenuItem("low", thinkingLevel, onSetThinkingLevel) { showThinkingMenu = false }
          ThinkingMenuItem("medium", thinkingLevel, onSetThinkingLevel) { showThinkingMenu = false }
          ThinkingMenuItem("high", thinkingLevel, onSetThinkingLevel) { showThinkingMenu = false }
        }

        // Text field
        Box(
          modifier = Modifier
            .weight(1f)
            .padding(horizontal = 4.dp),
        ) {
          BasicTextField(
            value = input,
            onValueChange = { input = it },
            modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
            textStyle = TextStyle(
              color = MaterialTheme.colorScheme.onSurface,
              fontSize = 16.sp,
            ),
            cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
            maxLines = 4,
            decorationBox = { innerTextField ->
              Box {
                if (input.isEmpty()) {
                  Text(
                    "Message Clawd…",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 16.sp,
                  )
                }
                innerTextField()
              }
            },
          )
        }

        // Right button: Abort / Send / Orb (PTT)
        if (pendingRunCount > 0) {
          // Abort button when running
          IconButton(
            onClick = onAbort,
            modifier = Modifier.size(44.dp),
          ) {
            Icon(
              Icons.Default.Stop,
              contentDescription = "Abort",
              tint = Color(0xFFE74C3C),
            )
          }
        } else if (hasText || attachments.isNotEmpty()) {
          // Send button when there's content
          FilledTonalIconButton(
            onClick = {
              val text = input
              input = ""
              onSend(text)
            },
            enabled = canSend,
            modifier = Modifier.size(44.dp),
            colors = IconButtonDefaults.filledTonalIconButtonColors(
              containerColor = seamColor,
              contentColor = Color.White,
            ),
          ) {
            Icon(Icons.Default.ArrowUpward, contentDescription = "Send")
          }
        } else {
          // Mini orb (PTT) when empty
          MiniOrb(
            seamColor = seamColor,
            isActive = talkEnabled,
            onClick = {
              haptic.performHapticFeedback(HapticFeedbackType.LongPress)
              onToggleTalk()
            },
          )
        }
      }
    }

    // Connection status pill (compact)
    ConnectionPill(sessionLabel = currentSessionLabel, healthOk = healthOk)
  }
}

@Composable
private fun AttachmentButton(
  icon: androidx.compose.ui.graphics.vector.ImageVector,
  label: String,
  onClick: () -> Unit,
  modifier: Modifier = Modifier,
) {
  Surface(
    onClick = onClick,
    modifier = modifier.height(80.dp),
    shape = RoundedCornerShape(12.dp),
    color = Color(0xFF4A4A5A),
  ) {
    Column(
      modifier = Modifier.padding(12.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.Center,
    ) {
      Icon(
        icon,
        contentDescription = label,
        tint = Color.White.copy(alpha = 0.8f),
        modifier = Modifier.size(24.dp),
      )
      Spacer(Modifier.height(6.dp))
      Text(
        label,
        style = MaterialTheme.typography.labelSmall,
        color = Color.White.copy(alpha = 0.8f),
      )
    }
  }
}

@Composable
private fun MiniOrb(
  seamColor: Color,
  isActive: Boolean,
  onClick: () -> Unit,
  modifier: Modifier = Modifier,
) {
  val alpha = if (isActive) 1f else 0.6f
  
  Box(
    modifier = modifier
      .size(44.dp)
      .clip(CircleShape)
      .clickable(
        interactionSource = remember { MutableInteractionSource() },
        indication = null,
        onClick = onClick,
      ),
    contentAlignment = Alignment.Center,
  ) {
    Canvas(modifier = Modifier.size(36.dp)) {
      val center = this.center
      val radius = size.minDimension / 2

      drawCircle(
        brush = Brush.radialGradient(
          colors = listOf(
            seamColor.copy(alpha = 0.9f * alpha),
            seamColor.copy(alpha = 0.4f * alpha),
            Color.Black.copy(alpha = 0.3f * alpha),
          ),
          center = center,
          radius = radius * 1.2f,
        ),
        radius = radius,
        center = center,
      )
    }
    
    // Mic icon overlay
    Icon(
      Icons.Default.Mic,
      contentDescription = if (isActive) "Listening" else "Tap to talk",
      tint = Color.White.copy(alpha = alpha),
      modifier = Modifier.size(20.dp),
    )
  }
}

@Composable
private fun ConnectionPill(sessionLabel: String, healthOk: Boolean) {
  Surface(
    shape = RoundedCornerShape(999.dp),
    color = MaterialTheme.colorScheme.surfaceContainerHighest.copy(alpha = 0.7f),
  ) {
    Row(
      modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
      horizontalArrangement = Arrangement.spacedBy(6.dp),
      verticalAlignment = Alignment.CenterVertically,
    ) {
      Surface(
        modifier = Modifier.size(6.dp),
        shape = CircleShape,
        color = if (healthOk) Color(0xFF2ECC71) else Color(0xFFF39C12),
      ) {}
      Text(
        if (healthOk) "Connected" else "Connecting…",
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
      )
    }
  }
}

@Composable
private fun ThinkingMenuItem(
  value: String,
  current: String,
  onSet: (String) -> Unit,
  onDismiss: () -> Unit,
) {
  DropdownMenuItem(
    text = { Text(thinkingLabel(value)) },
    onClick = {
      onSet(value)
      onDismiss()
    },
    trailingIcon = {
      if (value == current.trim().lowercase()) {
        Text("✓")
      } else {
        Spacer(modifier = Modifier.width(10.dp))
      }
    },
  )
}

private fun thinkingLabel(raw: String): String {
  return when (raw.trim().lowercase()) {
    "low" -> "Low"
    "medium" -> "Medium"
    "high" -> "High"
    else -> "Off"
  }
}

@Composable
private fun AttachmentsStrip(
  attachments: List<PendingImageAttachment>,
  onRemoveAttachment: (id: String) -> Unit,
) {
  Row(
    modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
    horizontalArrangement = Arrangement.spacedBy(8.dp),
  ) {
    for (att in attachments) {
      AttachmentChip(
        fileName = att.fileName,
        onRemove = { onRemoveAttachment(att.id) },
      )
    }
  }
}

@Composable
private fun AttachmentChip(fileName: String, onRemove: () -> Unit) {
  Surface(
    shape = RoundedCornerShape(999.dp),
    color = MaterialTheme.colorScheme.primary.copy(alpha = 0.10f),
  ) {
    Row(
      modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
      verticalAlignment = Alignment.CenterVertically,
      horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
      Text(text = fileName, style = MaterialTheme.typography.bodySmall, maxLines = 1)
      FilledTonalIconButton(
        onClick = onRemove,
        modifier = Modifier.size(24.dp),
      ) {
        Text("×", fontSize = 14.sp)
      }
    }
  }
}
