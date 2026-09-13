$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskStatic = Join-Path $taskRoot 'static'
foreach ($taskSize in @(48, 72, 96, 144, 192, 512)) {
    $taskBitmap = [System.Drawing.Bitmap]::new($taskSize, $taskSize)
    $taskGraphics = [System.Drawing.Graphics]::FromImage($taskBitmap)
    $taskGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $taskGraphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#21796b'))
    $taskGraphics.ScaleTransform($taskSize / 100.0, $taskSize / 100.0)
    $taskPen = [System.Drawing.Pen]::new([System.Drawing.Color]::White, 5)
    $taskPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $taskPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $taskGraphics.FillEllipse([System.Drawing.Brushes]::White, 39, 20, 22, 22)
    $taskGraphics.FillRectangle([System.Drawing.Brushes]::White, 39, 31, 22, 23)
    $taskGraphics.FillEllipse([System.Drawing.Brushes]::White, 39, 43, 22, 22)
    $taskGraphics.DrawArc($taskPen, 29, 39, 42, 34, 0, 180)
    $taskGraphics.DrawLine($taskPen, 29, 43, 29, 56)
    $taskGraphics.DrawLine($taskPen, 71, 43, 71, 56)
    $taskGraphics.DrawLine($taskPen, 50, 74, 50, 82)
    $taskGraphics.DrawLine($taskPen, 40, 83, 60, 83)
    $taskBitmap.Save((Join-Path $taskStatic "icon-$taskSize.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $taskPen.Dispose()
    $taskGraphics.Dispose()
    $taskBitmap.Dispose()
}
