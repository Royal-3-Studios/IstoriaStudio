<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Login</title>
    <link rel="stylesheet" href="${url.resourcesPath}/assets/main.css">
</head>
<body>
    <div id="root" class="h-full w-full"></div>
    <script>
        window.KEYCLOAK_LOGIN_ACTION = "${url.loginAction}";
        window.KEYCLOAK_REGISTER_ACTION = "${url.registrationUrl}";
        console.log("Injected registerAction from login.ftl:", window.KEYCLOAK_REGISTER_ACTION);
    </script>
    <script src="${url.resourcesPath}/assets/main.js"></script>
</body>
</html>
