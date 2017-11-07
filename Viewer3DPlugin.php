<?php
class Viewer3DPlugin extends Omeka_Plugin_AbstractPlugin {
    protected $_hooks = array('public_items_show');
    
    protected $_options = array(
        'viewer3d_manifest_description_element' => '',
        'viewer3d_manifest_description_default' => true,
        'viewer3d_manifest_attribution_element' => '',
        'viewer3d_manifest_attribution_default' => 'Provided by Example Organization',
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
     * Hook to display viewer.
     *
     * @param array $args
     */
    public function hookPublicItemsShow($args) {
        $FILE_DIRECTORY = "files/original";
        $ABSOLUTE_DIRECTORY = "http://localhost/omeka-2.5.1";
        
        /*if (!get_option('viewer3d_append_items_show')) {
            //return;
        }*/
        if (!isset($args['view'])) {
            $args['view'] = get_view();
        }
        $directory = "$FILE_DIRECTORY/".$args['item']['id'];
        $objFile = glob("$directory/*.obj"); // Search for obj.
        
        if (count($objFile) > 0) {
            $mtlFile = glob("$directory/*.mtl");
            if (count($mtlFile) > 0) {
                $objFile = basename($objFile[0]);
                $mtlFile = basename($mtlFile[0]);
                $directory = "$directory";
                $src = "../../plugins/Viewer3D/Viewer3D.php?absoluteDirectory=$ABSOLUTE_DIRECTORY&path=$directory&obj=".$objFile."&mtl=".$mtlFile;
                //$src = "../../plugins/Viewer3D/top.jpg";
                echo "<iframe width=\"100%\" height=\"400\" src=\"$src\"></iframe>";
            }
        }
    }
    
    function _showViewer($args) {
        $width = "100%";
        $height = "400";
        $htmlString = 
            "<script src='sylvester.js'></script>".
            "<script src='glUtils.js'></script>".
            "<script src='3DViewer.js'></script>".
            "<script src='Obj-processor.js'></script>".
            "<canvas id='glCanvas' width='100%' height='400'>".
            "    Your browser doesn't appear to support the <code>&lt;canvas&gt;</code> element.".
            "</canvas>";
        return htmlString;
    }
}
?>