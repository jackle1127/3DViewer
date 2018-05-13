<?php
class Viewer3DPlugin extends Omeka_Plugin_AbstractPlugin {
    protected $_hooks = array(
        'public_items_show', 
        'config_form',
        'config',
        'install'
    );
    
    protected $_options = array(
        'viewer3d_manifest_license_element' => '["Dublin Core", "Rights"]',
        'viewer3d_manifest_license_default' => 'http://www.example.org/license.html',
        'viewer3d_manifest_logo_default' => '',
        'viewer3d_alternative_manifest_element' => '',
        'viewer3d_append_collections_show' => true,
        'viewer3d_append_items_show' => true,
        'viewer3d_append_collections_browse' => false,
        'viewer3d_append_items_browse' => false,
        'viewer3d_class' => '',
        'viewer3d_style' => 'background-color: #000; height: 600px;',
        'viewer3d_locale' => 'en-GB:English (GB),fr:French',
        'viewer3d_iiif_creator' => 'Auto',
        'viewer3d_max_dynamic_size' => 10000000,
        'viewer3d_force_https' => false,
        'viewer3d_force_strict_json' => false,
    );
    /**
     * Installs the plugin.
     */
    public function hookInstall()
    {
        $this->_installOptions();
        set_option('viewer3d_options', json_encode($this -> getDefaultOptions()));
    }
    
    /**
     * Hook to display viewer.
     *
     * @param array $args
     */
    public function hookPublicItemsShow($args) {
        $FILE_DIRECTORY = "files/original/";
        
        /*if (!get_option('viewer3d_append_items_show')) {
            //return;
        }*/
        if (!isset($args['view'])) {
            $args['view'] = get_view();
        }
        $directory = "$FILE_DIRECTORY".$args['item']['id'];
        $objFile = glob("$directory/*.obj"); // Search for obj.
        
        if (count($objFile) > 0) {
            $mtlFile = glob("$directory/*.mtl");
            if (count($mtlFile) > 0) {
                $objFile = basename($objFile[0]);
                $mtlFile = basename($mtlFile[0]);
                $directory = "$directory";
                //$src = "../../plugins/Viewer3D/Viewer3D.php?absoluteDirectory=$ABSOLUTE_DIRECTORY&path=$directory&obj=".$objFile."&mtl=".$mtlFile;
                //$src = "../../plugins/Viewer3D/top.png";
                //echo "<iframe width=\"100%\" height=\"400\" src=\"$src\"></iframe>";
                $viewerArgs = new stdClass();
                $viewerArgs -> directory = $directory;
                $viewerArgs -> obj = $objFile;
                $viewerArgs -> mtl = $mtlFile;
                $viewerArgs -> options = get_option('viewer3d_options');
                if (isset($viewerArgs -> options)) {
                    $viewerArgs -> options = json_decode($viewerArgs -> options);
                } else {
                    $viewerArgs -> options = $this -> getDefaultOptions();
                }
                $this -> _showViewer($viewerArgs);
            }
        }
    }
    
    protected function _showViewer($args) {
        // PLUGIN_DIRECTORY is for the html to use.
        $PLUGIN_DIRECTORY = '../../plugins/Viewer3D/';
        
        ?>
            <script>
                var options = <?php echo json_encode($args -> options);?>;
                
                <?php
                    $backgroundPath = $PLUGIN_DIRECTORY . '/Resources/Backgrounds/Background_';
                    $backgroundOption = $args -> options -> background;
                    $backgroundPath .= $backgroundOption . '/';
                    
                    // Load the shaders into the shaders object.
                    $shaders = simplexml_load_file("plugins/Viewer3D/shaders.xml");
                    echo "var shaders = ".json_encode($shaders, TRUE).";\n";

                    // Load the needed files into modelJson object.
                    $model = new stdClass();
                    $model -> objText = file_get_contents($args -> directory . '/' . $args -> obj);
                    $model -> mtlText = file_get_contents($args -> directory . '/' . $args -> mtl);
                    $model -> path = '../../' . $args -> directory;
                    echo 'var modelJson = '.json_encode($model, TRUE).";\n";
                    echo 'var NUM_OF_LIGHTS = 2;' // For now.
                ?>
            </script>
            <script src='<?php echo $PLUGIN_DIRECTORY?>sylvester.js'></script>
            <script src='<?php echo $PLUGIN_DIRECTORY?>glUtils.js'></script>
            <script src='<?php echo $PLUGIN_DIRECTORY?>3DViewer.js'></script>
            <script src='<?php echo $PLUGIN_DIRECTORY?>Obj-processor.js'></script>
            <canvas id='glCanvas' style='width: 100%;
                    background: url("../../plugins/Viewer3D/Resources/Images/click_to_view_3d.png") no-repeat center; background-size: cover;
                    cursor: pointer;'
                    onclick='clickToView(this)'>                
            </canvas>
            <script>
                var modelViewer;
                document.getElementById('glCanvas').style.height = options.height + 'px';
                function clickToView(element) {
                    
                    element.onclick = null;
                    element.style.cursor = 'default';
                    
                    // Create model viewer.
                    modelViewer = new Viewer(document.getElementById("glCanvas"));

                    <?php
                        $this->_setBackground();
                        $this->_addLights();
                        $this->_configureViewer();
                    ?>
                    objToMesh(modelJson.objText, modelJson.mtlText, modelJson.path,
                        modelViewer, function(mesh) {
                            // Set default position and rotation.
                            mesh.setRotation(options.transform.rotation);
                            mesh.setPosition(options.transform.position);
                        });
                    window.onresize = function() {
                        modelViewer.resizeCanvas();
                    };
                    modelViewer.start(1000/60); // 60FPS
                }
            </script>
        <?php
    }
    
    protected function _setBackground() {
        ?>
            var backgroundPath = '../../plugins/Viewer3D/Resources/Backgrounds/Background_' + 
                    options.background + '/';
            // Load skybox.
            modelViewer.loadSkybox(backgroundPath + 'front.png', backgroundPath + 'back.png', 
                    backgroundPath + 'left.png', backgroundPath + 'right.png',
                    backgroundPath + 'top.png', backgroundPath + 'bottom.png');
            modelViewer.backgroundLOD = 0;
        <?php
    }
    
    protected function _addLights() {
        ?>
            modelViewer.directionalLights[0].color = [1, 1, .85, 1];
            modelViewer.directionalLights[0].setDirection([-.3, -.15, -.3]);
            modelViewer.directionalLights[0].fixed = true;
            modelViewer.directionalLights.push(new DirectionalLight());
            modelViewer.directionalLights[1].color = [0.439, 0.408, 0.267, 1];
            modelViewer.directionalLights[1].setDirection([.3, -.3, .9]);
            modelViewer.directionalLights[1].fixed = true;
        <?php
    }
    
    protected function _configureViewer() {
        ?>
            modelViewer.canvas.style.height = options.height + 'px';
            modelViewer.resizeCanvas();
            modelViewer.backgroundIntensity = options.backgroundIntensity;
            modelViewer.bloomIntensity = options.bloom.intensity;
            modelViewer.bloomThreshold = options.bloom.threshold;
            modelViewer.ambient = [
                options.environmentIntensity,
                options.environmentIntensity,
                options.environmentIntensity,
                1
            ];
            
        <?php
    }
    
    /**
     * Shows plugin configuration page.
     */
    public function hookConfigForm($args)
    {
        $view = get_view();
        $elementTable = $this->_db->getTable('Element');
        $configArgs -> options = get_option('viewer3d_options');
        if (isset($configArgs -> options)) {
            $configArgs -> options = json_decode($configArgs -> options);
        } else {
            $configArgs -> options = $this -> getDefaultOptions();
            set_option('viewer3d_options', json_encode($configArgs -> options));
        }
        //$configArgs -> options = $this -> getDefaultOptions();
        //set_option('viewer3d_options', json_encode($configArgs -> options));
        $this -> _showConfigForm($configArgs);
        
    }
    
    protected function _showConfigForm($args) {
        ?>
            <style>
                .hidden {
                    display: none;
                }
                .colorPicker {
                    width: 200px;
                    height: 100px;
                }
                #glCanvas {
                    width: 100%;
                }
            </style>
            <table>
                <tr><td colspan=2><canvas id='glCanvas'></td></tr>
                <tr>
                    <td>Viewer Height:</td>
                    <td><input type='number' id='height' onchange='updateOptions()'/> px</td>
                </tr>
                <tr>
                    <td>
                    Background:<br/>
                    (Custom background can be changed by replacing the corresponding images in the Resources/Backgrounds/Background_6 folder)
                    </td>
                    <td><select id='background' onchange='updateOptions()'></select></td>
                </tr>
                <tr>
                    <td>Default Object Transform:</td>
                    <td>
                        Position:
                        <br/>
                        X <input type='number' id='positionX' onchange='updateOptions()' step="0.01"/><br/>
                        Y <input type='number' id='positionY' onchange='updateOptions()' step="0.01"/><br/>
                        Z <input type='number' id='positionZ' onchange='updateOptions()' step="0.01"/><br/>
                        Rotation:
                        <br/>
                        X <input type='number' id='rotationX' onchange='updateOptions()' step="0.01"/><br/>
                        Y <input type='number' id='rotationY' onchange='updateOptions()' step="0.01"/><br/>
                        Z <input type='number' id='rotationZ' onchange='updateOptions()' step="0.01"/>
                    </td>
                </tr>
                <tr>
                    <td>Environment Intensity:</td>
                    <td>
                        <input type="number" id="environmentIntensity" onchange="updateOptions()" step="0.01">
                    </td>
                </tr>
                <tr>
                    <td>Background Intensity:</td>
                    <td><input type="number" id="backgroundIntensity" onchange="updateOptions()" step="0.01"></td>
                </tr>
                <tr>
                    <td>Bloom:</td>
                    <td>
                        Intensity:
                        <input type="number" id="bloomIntensity" onchange="updateOptions()" step="0.01">
                        Threshold:
                        <input type="number" id="bloomThreshold" onchange="updateOptions()" step="0.01">
                    </td>
                </tr>
            </table>
            <br/>
            <input type='text' name='options' id='options'/>
            <script>
                <?php
                    // Load the shaders into the shaders object.
                    $shaders = simplexml_load_file("../plugins/Viewer3D/shaders.xml");
                    echo "var shaders = ".json_encode($shaders, TRUE).";\n";
                    $model = new stdClass();
                    $model -> objText = file_get_contents("../plugins/Viewer3D/Resources/Models/sample.obj");
                    $model -> mtlText = file_get_contents("../plugins/Viewer3D/Resources/Models/sample.mtl");
                    $model -> path = '../../plugins/Viewer3D';
                    echo 'var modelJson = '.json_encode($model, TRUE).";\n";
                    $PLUGIN_DIRECTORY = '../../plugins/Viewer3D/';
                ?>
                var NUM_OF_LIGHTS = 2;
            </script>
            <script src='<?php echo $PLUGIN_DIRECTORY?>sylvester.js'></script>
            <script src='<?php echo $PLUGIN_DIRECTORY?>glUtils.js'></script>
            <script src='<?php echo $PLUGIN_DIRECTORY?>3DViewer.js'></script>
            <script src='<?php echo $PLUGIN_DIRECTORY?>Obj-processor.js'></script>
            <script>
                // Prevent form from submitting when enter key is pressed.
                document.onkeypress = function(e) {
                    var key = e.charCode || e.keyCode || 0;     
                    if (key == 13) {
                        updateOptions();
                        e.preventDefault();
                    }
                };

            
                var options = <?php echo json_encode($args -> options);?>;
                //alert(JSON.stringify(options, null, 2));
                
                // Height text box.
                var height = document.getElementById('height');
                height.value = options.height;
                
                // Background drop down.
                var BACKGROUND_NAMES = ['Indoor', 'Tunnel', 'Green Field', 'Road', 'Urban', 'Custom'];
                var background = document.getElementById('background');
                for (var i = 0; i < BACKGROUND_NAMES.length; i++) {
                    
                    var newOption = document.createElement('option');
                    newOption.value = i + 1;
                    newOption.innerText = BACKGROUND_NAMES[i];
                    newOption.selected = (options.background == i + 1);
                    background.appendChild(newOption);
                }
                
                //alert(JSON.stringify(options.transform.position, null, 2));
                // Object transformation.
                var positionX = document.getElementById('positionX');
                var positionY = document.getElementById('positionY');
                var positionZ = document.getElementById('positionZ');
                var rotationX = document.getElementById('rotationX');
                var rotationY = document.getElementById('rotationY');
                var rotationZ = document.getElementById('rotationZ');
                positionX.value = options.transform.position[0];
                positionY.value = options.transform.position[1];
                positionZ.value = options.transform.position[2];
                rotationX.value = options.transform.rotation[0];
                rotationY.value = options.transform.rotation[1];
                rotationZ.value = options.transform.rotation[2];
                
                // Environment color.
                var environmentIntensity = document.getElementById('environmentIntensity');
                environmentIntensity.value = options.environmentIntensity;
                
                // Background intensity.
                var backgroundIntensity = document.getElementById('backgroundIntensity');
                backgroundIntensity.value = options.backgroundIntensity;
                
                // Bloom.
                var bloomIntensity = document.getElementById('bloomIntensity');
                var bloomThreshold = document.getElementById('bloomThreshold');
                bloomIntensity.value = options.bloom.intensity;
                bloomThreshold.value = options.bloom.threshold;
                
                modelViewer = new Viewer(document.getElementById("glCanvas"));
                <?php
                    $this->_setBackground();
                    $this->_addLights();
                    $this->_configureViewer();
                ?>
                var defaulMesh = null;
                objToMesh(modelJson.objText, modelJson.mtlText, modelJson.path,
                    modelViewer, function(mesh) {
                        // Set default position and rotation.
                        mesh.setRotation(options.transform.rotation);
                        mesh.setPosition(options.transform.position);
                        defaulMesh = mesh;
                    });
                window.onresize = function() {
                    modelViewer.resizeCanvas();
                };
                modelViewer.start(1000/60); // 60FPS
                
                document.getElementById('options').value = JSON.stringify(options);
                
                function updateOptions() {
                    options.height = height.value;
                    var oldBackground = options.background;
                    options.background = background.value;
                    if (oldBackground != background.value) {
                        <?php $this->_setBackground();?>
                    }
                    options.transform.position[0] = positionX.value;
                    options.transform.position[1] = positionY.value;
                    options.transform.position[2] = positionZ.value;
                    options.transform.rotation[0] = rotationX.value;
                    options.transform.rotation[1] = rotationY.value;
                    options.transform.rotation[2] = rotationZ.value;
                    options.environmentIntensity = environmentIntensity.value;
                    options.backgroundIntensity = backgroundIntensity.value;
                    options.bloom.intensity = bloomIntensity.value;
                    options.bloom.threshold = bloomThreshold.value;
                
                    updateViewer();
                    
                    document.getElementById('options').value = JSON.stringify(options);
                }
                
                function updateViewer() {
                    <?php $this->_configureViewer();?>
                    if (defaulMesh != null) {
                        defaulMesh.setRotation(options.transform.rotation);
                        defaulMesh.setPosition(options.transform.position);
                    }
                }
                
                function componentToHex(c) {
                    var hex = c.toString(16);
                    return hex.length == 1 ? "0" + hex : hex;
                }

                function rgbToHex(rgb) {
                    return "#" + componentToHex(rgb[0] * 255) + componentToHex(rgb[1] * 255) + componentToHex(rgb[2] * 255);
                }
                
                function hexToRgb(hex) {
                    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                    return result ? [
                        parseInt(result[1], 16) / 255,
                        parseInt(result[2], 16) / 255,
                        parseInt(result[3], 16) / 255
                    ] : null;
                }
            </script>
            <?php
                //echo "\n" . get_option('viewer3d_options') . "\n";
                //echo "\n" . json_encode($args) . "\n";
                //echo "waHhhhhhhhhhhhhhhhh";
            ?>
        <?php
    }
    
    protected function getDefaultOptions() {
        $options = json_decode(
        '{'.
            '"height": 400,'.
            '"background": 3,'.
            '"transform": {'.
                '"position": [0, 0, 0],'.
                '"rotation": [0, 0, 0]'.
            '},'.
            '"environmentIntensity": 1,'.
            '"backgroundIntensity": 1,'.
            '"bloom": {"intensity": 1, "threshold": 1}'.
        '}');
        return $options;
    }
    
    /**
     * Processes the configuration form.
     *
     * @param array Options set in the config form.
     */
    public function hookConfig($args)
    {
        $post = $args['post'];
        set_option('viewer3d_options', $post['options']);
        
    }
}
?>