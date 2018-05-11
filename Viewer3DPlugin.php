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
                    $viewerArgs -> options = json_decode(viewerArgs -> options);
                } else {
                    $viewerArgs -> options = this -> getDefaultOptions();
                }
                $this -> _showViewer($viewerArgs);
            }
        }
    }
    
    protected function _showViewer($args) {
        // PLUGIN_DIRECTORY is for the html to use.
        $PLUGIN_DIRECTORY = '../../plugins/Viewer3D/';
        $clickToView = $PLUGIN_DIRECTORY . 'click_to_view_3d.png';
        
        $width = '100%';
        $height = $args -> options -> height . 'px';
        
        ?>
            <script>
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
            <canvas id='glCanvas' style='width: <?php echo $width?>; height: <?php echo $height?>;
                    background: url("<?php echo $clickToView?>") no-repeat center; background-size: cover;
                    cursor: pointer;'
                    onclick='clickToView(this)'>                
            </canvas>
            <script>
                var modelViewer;
                function clickToView(element) {
                    element.onclick = null;
                    element.style.cursor = 'default';
                    // Create model viewer.
                    modelViewer = new Viewer(document.getElementById("glCanvas"));
                    modelViewer.loadSkybox('<?php echo $backgroundPath?>front.png', '<?php echo $backgroundPath?>back.png', 
                            '<?php echo $backgroundPath?>left.png', '<?php echo $backgroundPath?>right.png',
                            '<?php echo $backgroundPath?>top.png', '<?php echo $backgroundPath?>bottom.png');
                    modelViewer.directionalLights[0].color = [1, 1, .85, 1];
                    modelViewer.directionalLights[0].setDirection([-.3, -.15, -.3]);
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
                    window.onresize = function() {
                        modelViewer.resizeCanvas();
                    };
                    modelViewer.start(1000/60); // 60FPS
                }
            </script>
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
            $configArgs -> options = json_decode(configArgs -> options);
            
        } else {
            $configArgs -> options = this -> getDefaultOptions();
        }
        this -> _showConfigForm($configArgs);
        
    }
    
    protected function _showConfigForm($arg) {
        ?>
            <style>
                .hidden {
                    display: none;
                }
            </style>
            <select id='viewer3d_options_background' name='viewer3d_options_background' >
                <option value=1 <?php if($args == 1) {echo('selected');}?>>Indoor</option>
                <option value=2 <?php if($backgroundOption == 2) {echo('selected');}?>>Tunnel</option>
                <option value=3 <?php if($backgroundOption == 3) {echo('selected');}?>>Green Field</option>
                <option value=4 <?php if($backgroundOption == 4) {echo('selected');}?>>Road</option>
                <option value=5 <?php if($backgroundOption == 5) {echo('selected');}?>>Urban</option>
            </select>
        <?php
    }
    
    protected function getDefaultOptions() {
        $option = new stdClass();
        $option -> height = 400;
        $option -> background = 3;
        return $option;
    }
    
    /**
     * Processes the configuration form.
     *
     * @param array Options set in the config form.
     */
    public function hookConfig($args)
    {
        $post = $args['post'];
        set_option('viewer3d_options_background', $post['viewer3d_options_background']);
        
    }
}
?>