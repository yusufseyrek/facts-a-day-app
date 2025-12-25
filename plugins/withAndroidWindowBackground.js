const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Custom Expo config plugin to set android:windowBackground in styles.xml
 * and configure proper light/dark colors for the window background.
 * 
 * This prevents the white flash during screen transitions by ensuring
 * the Android window background matches the app's theme.
 */
function withAndroidWindowBackground(
  config,
  {
    lightBackgroundColor = "#E8F0FA", // Light theme background
    darkBackgroundColor = "#0A1628",  // Dark theme background
  } = {}
) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const resPath = path.join(
        config.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res"
      );

      // 1. Update values/colors.xml with light theme background
      const colorsPath = path.join(resPath, "values", "colors.xml");
      if (fs.existsSync(colorsPath)) {
        let colorsContent = fs.readFileSync(colorsPath, "utf-8");
        
        if (colorsContent.includes('name="windowBackground"')) {
          colorsContent = colorsContent.replace(
            /<color name="windowBackground">.*<\/color>/,
            `<color name="windowBackground">${lightBackgroundColor}</color>`
          );
        } else {
          colorsContent = colorsContent.replace(
            "</resources>",
            `  <color name="windowBackground">${lightBackgroundColor}</color>\n</resources>`
          );
        }
        
        fs.writeFileSync(colorsPath, colorsContent, "utf-8");
      }

      // 2. Update values-night/colors.xml with dark theme background
      const nightColorsDir = path.join(resPath, "values-night");
      const nightColorsPath = path.join(nightColorsDir, "colors.xml");
      
      if (!fs.existsSync(nightColorsDir)) {
        fs.mkdirSync(nightColorsDir, { recursive: true });
      }

      let nightColorsContent;
      if (fs.existsSync(nightColorsPath)) {
        nightColorsContent = fs.readFileSync(nightColorsPath, "utf-8");
        
        if (nightColorsContent.includes("<resources/>")) {
          nightColorsContent = `<resources>\n  <color name="windowBackground">${darkBackgroundColor}</color>\n</resources>`;
        } else if (nightColorsContent.includes('name="windowBackground"')) {
          nightColorsContent = nightColorsContent.replace(
            /<color name="windowBackground">.*<\/color>/,
            `<color name="windowBackground">${darkBackgroundColor}</color>`
          );
        } else {
          nightColorsContent = nightColorsContent.replace(
            "</resources>",
            `  <color name="windowBackground">${darkBackgroundColor}</color>\n</resources>`
          );
        }
      } else {
        nightColorsContent = `<resources>\n  <color name="windowBackground">${darkBackgroundColor}</color>\n</resources>`;
      }
      
      fs.writeFileSync(nightColorsPath, nightColorsContent, "utf-8");

      // 3. Update styles.xml to use the windowBackground color
      const stylesPath = path.join(resPath, "values", "styles.xml");
      
      if (fs.existsSync(stylesPath)) {
        let stylesContent = fs.readFileSync(stylesPath, "utf-8");
        const hasWindowBackground = stylesContent.includes('android:windowBackground');
        
        if (hasWindowBackground) {
          stylesContent = stylesContent.replace(
            /<item name="android:windowBackground">[^<]*<\/item>/,
            '<item name="android:windowBackground">@color/windowBackground</item>'
          );
        } else {
          stylesContent = stylesContent.replace(
            /(<style name="AppTheme"[^>]*>)/,
            '$1\n    <item name="android:windowBackground">@color/windowBackground</item>'
          );
        }
        
        fs.writeFileSync(stylesPath, stylesContent, "utf-8");
      }

      return config;
    },
  ]);
}

module.exports = withAndroidWindowBackground;
