<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Forgot Your Password?</title>
    <link rel="stylesheet" href="${url.resourcesPath}/assets/main.css">
</head>
<body>
    <div id="root" class="h-full w-full"></div>
    <script>
        window.KEYCLOAK_LOGIN_ACTION = "${url.loginAction}";
        window.KEYCLOAK_REGISTER_ACTION = "${url.registrationUrl}";
        window.KEYCLOAK_RESET_PASSWORD_ACTION = "${url.loginAction}";
        console.log("Injected registerAction from update-password.ftl:", window.KEYCLOAK_REGISTER_ACTION);
        console.log("Injected registerAction from update-password.ftl:", window.KEYCLOAK_RESET_PASSWORD_ACTION);
    </script>
    <script src="${url.resourcesPath}/assets/main.js"></script>
</body>
</html>
