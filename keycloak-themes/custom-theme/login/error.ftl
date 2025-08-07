<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Error</title>
    <link rel="stylesheet" href="${url.resourcesPath}/assets/main.css">
</head>
<body>
    <div id="root"></div>

    <script>
        window.errorMessage = "${kcSanitize(message.summary)}";
        <#if theme??>
            window.themeMode = "${kcSanitize(theme.properties['mode']! 'light')}";
        <#else>
            window.themeMode = "light";
        </#if>
    </script>


    <script src="${url.resourcesPath}/app.js"></script>
</body>
</html>
