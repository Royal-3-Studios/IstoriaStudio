<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Register</title>
    <link rel="stylesheet" href="${url.resourcesPath}/assets/main.css">
</head>
<body>
    <div id="root" class="h-full w-full"></div>
    <script>
        // Ensure this gets the correct URL for the registration form
        window.KEYCLOAK_REGISTER_ACTION = "${url.registerAction}";
    </script>
    <script src="${url.resourcesPath}/assets/main.js"></script>
</body>
</html>
