# This is an auto-generated Django model module.
# You'll have to do the following manually to clean this up:
#   * Rearrange models' order
#   * Make sure each model has one field with primary_key=True
#   * Make sure each ForeignKey and OneToOneField has `on_delete` set to the desired behavior
#   * Remove `managed = False` lines if you wish to allow Django to create, modify, and delete the table
# Feel free to rename the models, but don't rename db_table values or field names.
from django.db import models


class ClassifierNode(models.Model):
    parent = models.ForeignKey('self', models.DO_NOTHING, blank=True, null=True)
    name = models.TextField(unique=True)
    unit = models.TextField(blank=True, null=True)
    sort_order = models.IntegerField()
    base_unit = models.ForeignKey('Unit', models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'classifier_node'


class EnumDefinition(models.Model):
    classifier_node = models.OneToOneField(ClassifierNode, models.DO_NOTHING)
    description = models.TextField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'enum_definition'


class EnumValue(models.Model):
    enum_definition = models.ForeignKey(EnumDefinition, models.DO_NOTHING)
    value_str = models.TextField(blank=True, null=True)
    value_int = models.IntegerField(blank=True, null=True)
    value_real = models.FloatField(blank=True, null=True)
    sort_order = models.IntegerField()

    class Meta:
        managed = False
        db_table = 'enum_value'


class ParameterDefinition(models.Model):
    classifier_node = models.ForeignKey(ClassifierNode, models.DO_NOTHING)
    name = models.CharField(max_length=128)
    unit = models.ForeignKey('Unit', models.DO_NOTHING, blank=True, null=True)
    value_type = models.CharField(max_length=8)
    sort_order = models.IntegerField()

    class Meta:
        managed = False
        db_table = 'parameter_definition'
        unique_together = (('classifier_node', 'name'),)


class ParameterNumericConstraint(models.Model):
    parameter_definition = models.OneToOneField(ParameterDefinition, models.DO_NOTHING, primary_key=True)
    min_value = models.DecimalField(max_digits=20, decimal_places=6)
    max_value = models.DecimalField(max_digits=20, decimal_places=6)

    class Meta:
        managed = False
        db_table = 'parameter_numeric_constraint'


class Product(models.Model):
    classifier_node = models.ForeignKey(ClassifierNode, models.DO_NOTHING)
    sku = models.CharField(unique=True, max_length=100, blank=True, null=True)
    name = models.TextField()
    created_at = models.DateTimeField(blank=True, null=True)
    price = models.IntegerField()
    supplier = models.TextField()
    weight_gram = models.IntegerField()
    designation = models.CharField(unique=True, max_length=64, blank=True, null=True)
    product_type = models.ForeignKey('ProductType', models.DO_NOTHING, db_column='product_type_code', to_field='code', default='part')
    unit = models.ForeignKey('Unit', models.DO_NOTHING, blank=True, null=True)
    base_product = models.ForeignKey('self', models.DO_NOTHING, blank=True, null=True, related_name='modifications')
    last_change = models.ForeignKey('BomChange', models.DO_NOTHING, blank=True, null=True, related_name='+')

    class Meta:
        managed = False
        db_table = 'product'


class ProductType(models.Model):
    code = models.CharField(primary_key=True, max_length=16)
    name = models.TextField(unique=True)
    production_role = models.CharField(max_length=16)
    can_have_bom = models.BooleanField()

    class Meta:
        managed = False
        db_table = 'product_type'


class BomChange(models.Model):
    product = models.ForeignKey(Product, models.DO_NOTHING, related_name='changes')
    change_no = models.IntegerField()
    description = models.TextField()
    author = models.TextField()
    created_at = models.DateTimeField()

    class Meta:
        managed = False
        db_table = 'bom_change'
        unique_together = (('product', 'change_no'),)


class BomItem(models.Model):
    parent_product = models.ForeignKey(Product, models.DO_NOTHING, related_name='bom_items')
    component = models.ForeignKey(Product, models.DO_NOTHING, related_name='used_in')
    position_no = models.IntegerField(default=0)
    quantity = models.DecimalField(max_digits=18, decimal_places=6)
    per_quantity = models.DecimalField(max_digits=18, decimal_places=6, default=1)
    unit = models.ForeignKey('Unit', models.DO_NOTHING)
    is_base = models.BooleanField(default=False)

    class Meta:
        managed = False
        db_table = 'bom_item'
        unique_together = (('parent_product', 'component'),)


class BomChangeLog(models.Model):
    change = models.ForeignKey(BomChange, models.DO_NOTHING, blank=True, null=True)
    parent_product_id = models.IntegerField()
    component_id = models.IntegerField()
    operation = models.CharField(max_length=8)
    old_quantity = models.DecimalField(max_digits=18, decimal_places=6, blank=True, null=True)
    new_quantity = models.DecimalField(max_digits=18, decimal_places=6, blank=True, null=True)
    old_per_quantity = models.DecimalField(max_digits=18, decimal_places=6, blank=True, null=True)
    new_per_quantity = models.DecimalField(max_digits=18, decimal_places=6, blank=True, null=True)
    old_unit_id = models.IntegerField(blank=True, null=True)
    new_unit_id = models.IntegerField(blank=True, null=True)
    old_is_base = models.BooleanField(blank=True, null=True)
    new_is_base = models.BooleanField(blank=True, null=True)
    changed_by = models.TextField()
    changed_at = models.DateTimeField()

    class Meta:
        managed = False
        db_table = 'bom_change_log'


class ProductAttributeValue(models.Model):
    product = models.ForeignKey(Product, models.DO_NOTHING)
    enum_value = models.ForeignKey(EnumValue, models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'product_attribute_value'


class ProductParameterValue(models.Model):
    product = models.ForeignKey(Product, models.DO_NOTHING)
    parameter_definition = models.ForeignKey(ParameterDefinition, models.DO_NOTHING)
    value_str = models.TextField(blank=True, null=True)
    value_int = models.IntegerField(blank=True, null=True)
    value_real = models.DecimalField(max_digits=12, decimal_places=4, blank=True, null=True)
    value_enum = models.ForeignKey(EnumValue, models.DO_NOTHING, blank=True, null=True)

    class Meta:
        managed = False
        db_table = 'product_parameter_value'
        unique_together = (('product', 'parameter_definition'),)


class Unit(models.Model):
    dimension = models.ForeignKey('UnitDimension', models.DO_NOTHING)
    name = models.CharField(max_length=64)
    symbol = models.CharField(unique=True, max_length=16)
    to_base_factor = models.DecimalField(max_digits=20, decimal_places=8)
    to_base_offset = models.DecimalField(max_digits=20, decimal_places=8)

    class Meta:
        managed = False
        db_table = 'unit'


class UnitDimension(models.Model):
    name = models.CharField(unique=True, max_length=64)

    class Meta:
        managed = False
        db_table = 'unit_dimension'

class OperationClass(models.Model):
    parent = models.ForeignKey('self', null=True, blank=True, on_delete=models.RESTRICT,
                               db_column='parent_id', related_name='children')
    name = models.TextField(unique=True)
    sort_order = models.IntegerField(default=0)

    class Meta:
        db_table = 'operation_class'
        managed = False


class WorkCenterGroup(models.Model):
    parent = models.ForeignKey('self', null=True, blank=True, on_delete=models.RESTRICT,
                               db_column='parent_id', related_name='children')
    name = models.TextField(unique=True)
    sort_order = models.IntegerField(default=0)

    class Meta:
        db_table = 'work_center_group'
        managed = False


class Profession(models.Model):
    name = models.CharField(max_length=128)
    grade = models.IntegerField()
    hourly_rate = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        db_table = 'profession'
        managed = False


class Tooling(models.Model):
    designation = models.CharField(max_length=64, unique=True)
    name = models.TextField()
    tooling_type = models.CharField(max_length=8, default='tool')

    class Meta:
        db_table = 'tooling'
        managed = False


class Route(models.Model):
    # created_at не описан: его заполняет значение по умолчанию в БД
    product = models.ForeignKey('Product', on_delete=models.CASCADE,
                                db_column='product_id', related_name='routes')
    route_no = models.IntegerField(default=1)
    name = models.TextField()

    class Meta:
        db_table = 'route'
        managed = False


class RouteOperation(models.Model):
    route = models.ForeignKey(Route, on_delete=models.CASCADE,
                              db_column='route_id', related_name='operations')
    position_no = models.IntegerField()
    name = models.TextField()
    operation_class = models.ForeignKey(OperationClass, on_delete=models.DO_NOTHING,
                                        db_column='operation_class_id')
    work_center_group = models.ForeignKey(WorkCenterGroup, on_delete=models.DO_NOTHING,
                                          db_column='work_center_group_id')
    profession = models.ForeignKey(Profession, on_delete=models.DO_NOTHING,
                                   db_column='profession_id')
    time_norm = models.DecimalField(max_digits=10, decimal_places=2)
    time_unit = models.ForeignKey('Unit', on_delete=models.DO_NOTHING,
                                  db_column='time_unit_id', related_name='+')

    class Meta:
        db_table = 'route_operation'
        managed = False


class RouteOperationTool(models.Model):
    route_operation = models.ForeignKey(RouteOperation, on_delete=models.CASCADE,
                                        db_column='route_operation_id', related_name='tools')
    tooling = models.ForeignKey(Tooling, on_delete=models.DO_NOTHING,
                                db_column='tooling_id')
    quantity = models.IntegerField(default=1)

    class Meta:
        db_table = 'route_operation_tool'
        managed = False


class RouteOperationMaterial(models.Model):
    route_operation = models.ForeignKey(RouteOperation, on_delete=models.CASCADE,
                                        db_column='route_operation_id', related_name='materials')
    product = models.ForeignKey('Product', on_delete=models.DO_NOTHING,
                                db_column='product_id', related_name='route_materials')
    quantity = models.DecimalField(max_digits=18, decimal_places=6)
    per_quantity = models.DecimalField(max_digits=18, decimal_places=6, default=1)
    unit = models.ForeignKey('Unit', on_delete=models.DO_NOTHING,
                             db_column='unit_id', related_name='+')

    class Meta:
        db_table = 'route_operation_material'
        managed = False
