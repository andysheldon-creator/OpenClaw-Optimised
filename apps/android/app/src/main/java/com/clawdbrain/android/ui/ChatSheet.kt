package com.clawdbrain.android.ui

import androidx.compose.runtime.Composable
import com.clawdbrain.android.MainViewModel
import com.clawdbrain.android.ui.chat.ChatSheetContent

@Composable
fun ChatSheet(viewModel: MainViewModel) {
  ChatSheetContent(viewModel = viewModel)
}
