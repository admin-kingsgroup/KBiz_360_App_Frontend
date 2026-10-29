package com.kingsgroup.kbiz360.widget

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS → Android widget bridge. src/services/widget.ts calls setSnapshot with the same JSON it writes
 * to the iOS App Group; the Work Board stores it and redraws.
 */
class KbizWidgetModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("KbizWidget")

    AsyncFunction("setSnapshot") { json: String ->
      val ctx = appContext.reactContext?.applicationContext ?: return@AsyncFunction
      SnapshotStore.save(ctx, json)
      WorkBoardWidget.redrawAll(ctx)
    }
  }
}
