<html>
    <head>
        <script>
            <?php
                
                // User-specified path is for the model subfolder in the 3d-models folder.
                $absoluteDirectory = $_GET['absoluteDirectory'];
                $path = $absoluteDirectory . "/" . $_GET['path'];
                $objFileName = $_GET['obj'];
                $mtlFileName = $_GET['mtl'];
                
                $shaders = simplexml_load_file("$absoluteDirectory/plugins/Viewer3D/shaders.xml");
                echo "var shaders = ".json_encode($shaders, TRUE).";\n";

                $model = new stdClass();
                try {
                    $model -> objText = file_get_contents($path . '/' . $objFileName);
                    $model -> mtlText = file_get_contents($path . '/' . $mtlFileName);
                } catch (Exception $e) {
                    die('Cannot load 3D asset.');
                }
                $model -> path = $path;

                echo 'var modelJson = '.json_encode($model, TRUE).";\n";
            ?>
        </script>
        <title>3D Viewer Test</title>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
        <script src="sylvester.js"></script>
        <script src="glUtils.js"></script>
        <script src="3DViewer.js"></script>
        <script src="Obj-processor.js"></script>
        <style>
            #html, body {
                padding: 0;
                margin: 0;
            }
            #glCanvas {
                background-color: black;
                width: 100%;
                height: 100%;
            }
        </style>
    </head>
    <body>
        <canvas id="glCanvas">
            Your browser doesn't appear to support the <code>&lt;canvas&gt;</code> element.
        </canvas>
    </body>
    <script>
        var modelViewer = new Viewer(document.getElementById("glCanvas"));
        modelViewer.loadSkybox('front.png', 'back.png', 
                'left.png', 'right.png',
                'top.png', 'bottom.png');
        modelViewer.directionalLights[0].color = [0.439, 0.408, 0.267, 1];
        modelViewer.directionalLights[0].setDirection([.3, -.3, -.9]);
        modelViewer.directionalLights[0].fixed = true;
        modelViewer.directionalLights.push(new DirectionalLight());
        modelViewer.directionalLights[1].color = [0.439, 0.408, 0.267, 1];
        modelViewer.directionalLights[1].setDirection([.3, -.3, .9]);
        modelViewer.directionalLights[1].fixed = true;
        modelViewer.backgroundLOD = 0;
        //modelViewer.ambient = [0, 0, 0, 1];
        
        objToMesh(modelJson['objText'], modelJson['mtlText'], modelJson['path'],
            modelViewer, function(mesh) {
                //mesh.rotation = [90, 0, 0];
            });
        modelViewer.start(1000/60); // 60FPS
    </script>
</html>